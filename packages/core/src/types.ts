export type Sex = "남자" | "여자";

export interface Persona {
  uuid: string;

  professional_persona: string;
  sports_persona: string;
  arts_persona: string;
  travel_persona: string;
  culinary_persona: string;
  family_persona: string;
  persona: string;

  cultural_background: string;
  skills_and_expertise: string;
  skills_and_expertise_list: string;
  hobbies_and_interests: string;
  hobbies_and_interests_list: string;
  career_goals_and_ambitions: string;

  sex: Sex;
  age: number;
  marital_status: string;
  military_status: string;
  family_type: string;
  housing_type: string;
  education_level: string;
  bachelors_field: string;
  occupation: string;
  district: string;
  province: string;
  country: string;
}

export interface SampleFilters {
  province?: string | string[];
  district?: string | string[];
  sex?: Sex;
  age_range?: [number, number];
  education_level?: string | string[];
  occupation_contains?: string;
  marital_status?: string | string[];
  family_type?: string | string[];
  housing_type?: string | string[];
}

export interface SampleOptions {
  filters?: SampleFilters;
  n: number;
  seed?: number;
}

export type StratifyDimension =
  | "province"
  | "age_decade"
  | "education_level"
  | "sex";

export interface PanelOptions {
  filters?: SampleFilters;
  n: number;
  stratify_by?: StratifyDimension;
  seed?: number;
}

export interface SchemaInfo {
  filterable_columns: Array<{
    name: string;
    type: "categorical" | "range" | "freetext";
    description: string;
    allowed_values?: readonly string[];
    range?: readonly [number, number];
    cardinality?: number;
  }>;
  total_records: number;
  data_version: string;
  citation: string;
}
