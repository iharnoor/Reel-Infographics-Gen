export interface Scene {
  id: number;
  text: string;
  visualPrompt: string;
  imageData?: string; // Base64 string
  videoUri?: string; // URI for the generated video
  duration: number; // Duration in seconds for this slide
  status: 'pending' | 'generating' | 'completed' | 'error';
  videoStatus: 'none' | 'generating' | 'completed' | 'error';
}

export interface Storyboard {
  title: string;
  scenes: Scene[];
}

export interface GenerationConfig {
  script: string;
  targetDuration: number; // Total target duration in seconds
}