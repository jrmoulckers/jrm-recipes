/**
 * First-run onboarding copy (issue #147). Centralized so the welcome moment can
 * be localized or mode-adapted later without hunting through JSX. Voice follows
 * `docs/voice-and-tone.md`: warm, familial, encouraging, and oriented around the
 * core loop — create → cook → share.
 */

export interface OnboardingStep {
  /** Short imperative title for the step. */
  title: string;
  /** One warm line of guidance. */
  body: string;
}

export interface WelcomeCopy {
  heading: string;
  subheading: string;
  steps: [OnboardingStep, OnboardingStep, OnboardingStep];
  /** Primary CTA on step one. */
  cta: string;
  /** Dismiss affordance. */
  dismiss: string;
}

export const WELCOME_COPY: WelcomeCopy = {
  heading: "Welcome to Heirloom 👋",
  subheading: "Three little steps to keep your family's recipes alive.",
  steps: [
    {
      title: "Add a recipe",
      body: "Start with the dish everyone asks you to make.",
    },
    {
      title: "Cook it hands-free",
      body: "Open Cook Mode for timers and step-by-step.",
    },
    {
      title: "Share with family",
      body: "Invite your people to a group cookbook.",
    },
  ],
  cta: "Create your first recipe",
  dismiss: "Maybe later",
};
