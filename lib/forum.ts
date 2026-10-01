import { supabase } from "./supabaseClient"

export interface ForumPost {
  id: string
  user_id: string
  title: string
  content: string
  created_at: string
  updated_at: string
  likes: number
  user_has_liked: boolean
  resolved: boolean
  user?: {
    id: string
    full_name?: string
    avatar_url?: string
  }
  comments?: ForumComment[]
  attachments?: ForumAttachment[]
}

export interface ForumComment {
  id: string
  post_id: string
  user_id: string
  content: string
  created_at: string
  updated_at: string
  user?: {
    id: string
    full_name?: string
    avatar_url?: string
  }
  attachments?: ForumAttachment[]
}

export interface ForumAttachment {
  id: string
  post_id?: string
  comment_id?: string
  user_id: string
  file_name: string
  file_path: string
  file_type: string
  file_size: number
  created_at: string
  url?: string
}

type ProfileSummary = { id: string; full_name?: string; avatar_url?: string }

const SIGNED_URL_TTL_SECONDS = 60 * 60

// Gera os links assinados de todos os anexos numa única chamada ao storage
async function withSignedUrls(attachments: ForumAttachment[]): Promise<ForumAttachment[]> {
  if (attachments.length === 0) return []
  const { data, error } = await supabase.storage
    .from("forum_attachments")
    .createSignedUrls(
      attachments.map((a) => a.file_path),
      SIGNED_URL_TTL_SECONDS,
    )
  if (error) {
    console.error("Erro ao gerar links dos anexos:", error)
    return attachments
  }
  const urlByPath = new Map(data.map((d) => [d.path, d.signedUrl]))
  return attachments.map((a) => ({ ...a, url: urlByPath.get(a.file_path) ?? undefined }))
}

const IN_CHUNK_SIZE = 100 // evita URLs longas demais no filtro .in()
const PAGE_ROWS = 1000 // limite padrão de linhas por resposta do PostgREST

/**
 * Busca todas as linhas de `table` cujo `column` está em `ids`, dividindo os ids em blocos
 * e paginando cada bloco. Sem isso, o PostgREST corta a resposta em 1000 linhas sem avisar.
 */
async function selectAllIn<T>(table: string, columns: string, column: string, ids: string[]): Promise<T[]> {
  const rows: T[] = []
  for (let i = 0; i < ids.length; i += IN_CHUNK_SIZE) {
    const chunk = ids.slice(i, i + IN_CHUNK_SIZE)
    for (let from = 0; ; from += PAGE_ROWS) {
      const { data, error } = await supabase
        .from(table)
        .select(columns)
        .in(column, chunk)
        .order("created_at", { ascending: true })
        .range(from, from + PAGE_ROWS - 1)
      if (error) throw error
      rows.push(...((data ?? []) as T[]))
      if (!data || data.length < PAGE_ROWS) break
    }
  }
  return rows
}

function groupBy<T>(items: T[], key: (item: T) => string | null | undefined): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const item of items) {
    const k = key(item)
    if (!k) continue
    const list = map.get(k)
    if (list) list.push(item)
    else map.set(k, [item])
  }
  return map
}

/**
 * Busca as discussões abertas mais recentes, com autor, comentários, anexos e curtidas.
 * Usa um número fixo de consultas (em lote), não importa quantos posts venham:
 * posts → (comentários, curtidas, anexos dos posts) → (anexos dos comentários, perfis) → links.
 */
export async function getForumPosts(
  limit = 20,
  currentUserId?: string,
): Promise<{ posts: ForumPost[]; total: number }> {
  const { data: posts, error: postsError, count } = await supabase
    .from("forum_posts")
    .select("*", { count: "exact" })
    .eq("resolved", false)
    .order("created_at", { ascending: false })
    .range(0, limit - 1)

  if (postsError) throw postsError
  if (!posts || posts.length === 0) return { posts: [], total: count ?? 0 }

  const postIds = posts.map((p) => p.id)

  const logAndEmpty = (what: string) => (error: unknown) => {
    console.error(`Erro ao buscar ${what}:`, error)
    return []
  }

  const [comments, likes, postAttachments] = await Promise.all([
    selectAllIn<ForumComment>("forum_comments", "*", "post_id", postIds),
    selectAllIn<{ post_id: string; user_id: string }>("post_likes", "post_id, user_id", "post_id", postIds).catch(
      logAndEmpty("curtidas"),
    ),
    selectAllIn<ForumAttachment>("forum_attachments", "*", "post_id", postIds).catch(logAndEmpty("anexos dos posts")),
  ])

  const commentIds = comments.map((c) => c.id)
  const userIds = [...new Set([...posts.map((p) => p.user_id), ...comments.map((c) => c.user_id)])]

  const [profileRows, commentAttachments] = await Promise.all([
    supabase
      .from("profiles_public")
      .select("id, full_name, avatar_url")
      .in("id", userIds)
      .then(({ data, error }) => {
        if (error) console.error("Erro ao buscar perfis:", error)
        return (data ?? []) as ProfileSummary[]
      }),
    selectAllIn<ForumAttachment>("forum_attachments", "*", "comment_id", commentIds).catch(
      logAndEmpty("anexos dos comentários"),
    ),
  ])

  const attachments = await withSignedUrls([...postAttachments, ...commentAttachments])

  const profiles = new Map<string, ProfileSummary>(profileRows.map((p) => [p.id, p]))
  const attachmentsByPost = groupBy(attachments, (a) => a.post_id)
  const attachmentsByComment = groupBy(attachments, (a) => a.comment_id)
  const commentsByPost = groupBy(comments, (c) => c.post_id)
  const likesByPost = groupBy(likes, (l) => l.post_id)

  const result: ForumPost[] = posts.map((post) => {
    const postLikes = likesByPost.get(post.id) ?? []
    return {
      ...post,
      user: profiles.get(post.user_id),
      attachments: attachmentsByPost.get(post.id) ?? [],
      likes: postLikes.length,
      user_has_liked: currentUserId ? postLikes.some((l) => l.user_id === currentUserId) : false,
      comments: (commentsByPost.get(post.id) ?? []).map((comment) => ({
        ...comment,
        user: profiles.get(comment.user_id),
        attachments: attachmentsByComment.get(comment.id) ?? [],
      })),
    }
  })

  return { posts: result, total: count ?? result.length }
}

export async function createForumPost(
  userId: string,
  title: string,
  content: string,
  attachments?: File[],
): Promise<ForumPost> {
  try {
    // First, insert the post
    const { data: insertedPost, error: insertError } = await supabase
      .from("forum_posts")
      .insert([{ user_id: userId, title, content, resolved: false }])
      .select()

    if (insertError) {
      console.error("Erro ao inserir post:", insertError.message, "| código:", insertError.code, "| detalhes:", insertError.details)
      throw insertError
    }
    if (!insertedPost || insertedPost.length === 0) throw new Error("No data returned from post insertion")

    const newPost = insertedPost[0] // Get the first (and should be only) inserted post

    // Upload attachments if any
    const uploadedAttachments: ForumAttachment[] = []
    if (attachments && attachments.length > 0) {
      for (const file of attachments) {
        const fileExt = file.name.split(".").pop()
        const fileName = `${userId}/${newPost.id}/${Math.random().toString(36).substring(2)}.${fileExt}`

        // Upload file to Supabase Storage
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from("forum_attachments")
          .upload(fileName, file)

        if (uploadError) {
          console.error("Error uploading attachment:", uploadError)
          continue // Skip this file if upload fails
        }

        // Insert attachment record in database
        const { data: attachmentData, error: attachmentError } = await supabase
          .from("forum_attachments")
          .insert([
            {
              post_id: newPost.id,
              user_id: userId,
              file_name: file.name,
              file_path: fileName,
              file_type: file.type,
              file_size: file.size,
            },
          ])
          .select()

        if (attachmentError) {
          console.error("Error inserting attachment record:", attachmentError)
          continue
        }

        if (attachmentData && attachmentData.length > 0) {
          // Get URL for the uploaded file
          const { data: urlData } = await supabase.storage.from("forum_attachments").createSignedUrl(fileName, 3600) // URL valid for 1 hour

          uploadedAttachments.push({
            ...attachmentData[0],
            url: urlData?.signedUrl || undefined,
          })
        }
      }
    }

    // Fetch user data
    const { data: userData, error: userError } = await supabase
      .from("profiles_public")
      .select("id, full_name, avatar_url")
      .eq("id", userId)
      .single()

    if (userError) throw userError

    // Return the formatted post
    return {
      ...newPost,
      user: userData,
      comments: [],
      attachments: uploadedAttachments,
      user_has_liked: false,
      likes: 0,
    }
  } catch (error) {
    console.error("Error in createForumPost:", error)
    throw error
  }
}

export async function createForumComment(
  userId: string,
  postId: string,
  content: string,
  attachments?: File[],
): Promise<ForumComment> {
  try {
    const { data: comment, error } = await supabase
      .from("forum_comments")
      .insert([{ user_id: userId, post_id: postId, content }])
      .select()
      .single()

    if (error) throw error
    if (!comment) throw new Error("Falha ao criar o comentário")

    // Upload attachments if any
    const uploadedAttachments: ForumAttachment[] = []
    if (attachments && attachments.length > 0) {
      for (const file of attachments) {
        const fileExt = file.name.split(".").pop()
        const fileName = `${userId}/${postId}/${comment.id}/${Math.random().toString(36).substring(2)}.${fileExt}`

        // Upload file to Supabase Storage
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from("forum_attachments")
          .upload(fileName, file)

        if (uploadError) {
          console.error("Error uploading attachment:", uploadError)
          continue // Skip this file if upload fails
        }

        // Insert attachment record in database
        const { data: attachmentData, error: attachmentError } = await supabase
          .from("forum_attachments")
          .insert([
            {
              comment_id: comment.id,
              user_id: userId,
              file_name: file.name,
              file_path: fileName,
              file_type: file.type,
              file_size: file.size,
            },
          ])
          .select()

        if (attachmentError) {
          console.error("Error inserting attachment record:", attachmentError)
          continue
        }

        if (attachmentData && attachmentData.length > 0) {
          // Get URL for the uploaded file
          const { data: urlData } = await supabase.storage.from("forum_attachments").createSignedUrl(fileName, 3600) // URL valid for 1 hour

          uploadedAttachments.push({
            ...attachmentData[0],
            url: urlData?.signedUrl || undefined,
          })
        }
      }
    }

    // Fetch user data
    const { data: userData, error: userError } = await supabase
      .from("profiles_public")
      .select("id, full_name, avatar_url")
      .eq("id", userId)
      .single()

    if (userError) {
      console.error("Error fetching user data:", userError)
    }

    return {
      ...comment,
      user: userError ? undefined : userData,
      attachments: uploadedAttachments,
    }
  } catch (error) {
    console.error("Error in createForumComment:", error)
    throw error
  }
}

export async function toggleForumPostLike(
  postId: string,
  userId: string,
): Promise<{ likes: number; userHasLiked: boolean }> {
  try {
    // Verificar se o usuário já curtiu o post
    const { data: existingLike, error: checkError } = await supabase
      .from("post_likes")
      .select("*")
      .eq("post_id", postId)
      .eq("user_id", userId)
      .single()

    if (checkError && checkError.code !== "PGRST116") {
      // PGRST116 é o código para "nenhum resultado encontrado", que é esperado se o usuário não curtiu o post
      throw checkError
    }

    // Se o usuário já curtiu, remover a curtida
    if (existingLike) {
      console.log(`Removendo curtida do post ${postId} pelo usuário ${userId}`)
      const { error: deleteError } = await supabase
        .from("post_likes")
        .delete()
        .eq("post_id", postId)
        .eq("user_id", userId)

      if (deleteError) throw deleteError
    }
    // Se o usuário não curtiu, adicionar a curtida
    else {
      console.log(`Adicionando curtida ao post ${postId} pelo usuário ${userId}`)
      const { error: insertError } = await supabase.from("post_likes").insert([{ post_id: postId, user_id: userId }])

      if (insertError) throw insertError
    }

    // Contar o número total de curtidas após a operação
    const { data: likes, error: countError } = await supabase
      .from("post_likes")
      .select("*", { count: "exact" })
      .eq("post_id", postId)

    if (countError) throw countError

    // Verificar novamente se o usuário curtiu o post (para garantir consistência)
    const { data: userLike, error: userLikeError } = await supabase
      .from("post_likes")
      .select("*")
      .eq("post_id", postId)
      .eq("user_id", userId)
      .single()

    if (userLikeError && userLikeError.code !== "PGRST116") throw userLikeError

    const likesCount = likes?.length || 0
    const userHasLiked = !!userLike

    console.log(`Resultado final: Post ${postId} tem ${likesCount} curtidas, usuário curtiu: ${userHasLiked}`)

    return {
      likes: likesCount,
      userHasLiked: userHasLiked,
    }
  } catch (error) {
    console.error("Error in toggleForumPostLike:", error)
    throw error
  }
}

export async function getPostLikes(postId: string, userId: string): Promise<{ likes: number; userHasLiked: boolean }> {
  try {
    const { data, error } = await supabase.from("post_likes").select("*", { count: "exact" }).eq("post_id", postId)

    if (error) throw error

    const { data: userLike, error: userLikeError } = await supabase
      .from("post_likes")
      .select()
      .eq("post_id", postId)
      .eq("user_id", userId)
      .single()

    if (userLikeError && userLikeError.code !== "PGRST116") throw userLikeError

    console.log("Get post likes response:", { likes: data?.length ?? 0, userHasLiked: !!userLike })

    return {
      likes: data?.length ?? 0,
      userHasLiked: !!userLike,
    }
  } catch (error) {
    console.error("Error in getPostLikes:", error)
    throw error
  }
}

export async function deleteForumPost(postId: string): Promise<void> {
  try {
    // First, delete all attachments from storage
    const { data: attachments, error: fetchError } = await supabase
      .from("forum_attachments")
      .select("file_path")
      .eq("post_id", postId)

    if (fetchError) {
      console.error("Error fetching attachments for deletion:", fetchError)
    } else if (attachments && attachments.length > 0) {
      // Delete files from storage
      const filePaths = attachments.map((a) => a.file_path)
      const { error: storageError } = await supabase.storage.from("forum_attachments").remove(filePaths)

      if (storageError) {
        console.error("Error deleting attachment files from storage:", storageError)
      }
    }

    // Then delete the post (this will cascade delete attachments records due to foreign key)
    const { error } = await supabase.from("forum_posts").delete().eq("id", postId)
    if (error) {
      console.error("Error deleting forum post:", error)
      throw error
    }
  } catch (error) {
    console.error("Error in deleteForumPost:", error)
    throw error
  }
}

export async function updateForumPost(
  postId: string,
  title: string,
  content: string,
  newAttachments?: File[],
): Promise<void> {
  try {
    console.log("Atualizando post:", { postId, title, content })

    const { data, error } = await supabase
      .from("forum_posts")
      .update({
        title,
        content,
        updated_at: new Date().toISOString(),
      })
      .eq("id", postId)
      .select()

    if (error) {
      console.error("Error updating forum post:", error)
      throw error
    }

    // Upload new attachments if any
    if (newAttachments && newAttachments.length > 0) {
      // Get user ID
      const { data: post, error: postError } = await supabase
        .from("forum_posts")
        .select("user_id")
        .eq("id", postId)
        .single()

      if (postError) {
        console.error("Error fetching post user_id:", postError)
        throw postError
      }

      const userId = post.user_id

      for (const file of newAttachments) {
        const fileExt = file.name.split(".").pop()
        const fileName = `${userId}/${postId}/${Math.random().toString(36).substring(2)}.${fileExt}`

        // Upload file to Supabase Storage
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from("forum_attachments")
          .upload(fileName, file)

        if (uploadError) {
          console.error("Error uploading attachment:", uploadError)
          continue // Skip this file if upload fails
        }

        // Insert attachment record in database
        const { error: attachmentError } = await supabase.from("forum_attachments").insert([
          {
            post_id: postId,
            user_id: userId,
            file_name: file.name,
            file_path: fileName,
            file_type: file.type,
            file_size: file.size,
          },
        ])

        if (attachmentError) {
          console.error("Error inserting attachment record:", attachmentError)
        }
      }
    }

    console.log("Post atualizado com sucesso:", data)
  } catch (error) {
    console.error("Error in updateForumPost:", error)
    throw error
  }
}

export async function deleteAttachment(attachmentId: string): Promise<void> {
  try {
    // First get the file path
    const { data: attachment, error: fetchError } = await supabase
      .from("forum_attachments")
      .select("file_path")
      .eq("id", attachmentId)
      .single()

    if (fetchError) {
      console.error("Error fetching attachment for deletion:", fetchError)
      throw fetchError
    }

    // Delete the file from storage
    const { error: storageError } = await supabase.storage.from("forum_attachments").remove([attachment.file_path])

    if (storageError) {
      console.error("Error deleting file from storage:", storageError)
    }

    // Delete the attachment record
    const { error: deleteError } = await supabase.from("forum_attachments").delete().eq("id", attachmentId)

    if (deleteError) {
      console.error("Error deleting attachment record:", deleteError)
      throw deleteError
    }
  } catch (error) {
    console.error("Error in deleteAttachment:", error)
    throw error
  }
}
