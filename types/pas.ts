export interface Course {
  id: string
  name: string
  degree: string
  schedule: string
  campus: string
  cutoffScores?: {
    universal: number
    blackQuota: number
    lowIncome: number
    lowIncomeBlack: number
    ppi: number
    pcd: number
  }
}

// Valores vêm dos campos do formulário, por isso são strings (convertidas no cálculo)
export interface PASGrade {
  exam: string
  essay: string
  language: {
    type: "english" | "spanish" | "french"
    grade: string
  }
}

export interface AdmissionSystem {
  id: string
  name: string
  description?: string
  isPublicSchool?: boolean
}

export interface PASResult {
  finalScore: number
  breakdown: {
    pas1: number
    pas2: number
    pas3: number
  }
  eligibleCourses: {
    course: Course
    status: "within" | "outside"
    difference: number
  }[]
}
