export interface OnboardingData {
  // Step 1
  exam_config_id: string;
  course_label: string;
  // Step 2
  hours_per_day: number | null;
  available_days: string[];
  // Step 3
  school_stage: string;
  current_biggest_difficulty: string;
  // Step 4
  self_declared_blocks: Record<string, string>;
  // Meta
  current_step: number;
}

export const INITIAL_DATA: OnboardingData = {
  exam_config_id: "",
  course_label: "",
  hours_per_day: null,
  available_days: ["seg", "ter", "qua", "qui", "sex"],
  school_stage: "",
  current_biggest_difficulty: "",
  self_declared_blocks: {},
  current_step: 1,
};

export const STORAGE_KEY = "catedra_onboarding_draft";
