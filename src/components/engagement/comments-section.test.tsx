import { cleanup, render as rtlRender, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as React from "react";

import { CommentsSection } from "./comments-section";
import type { ThreadedComment } from "~/server/engagement/queries";
import { IntlWrapper } from "~/test/intl";
import {
  addCommentAction,
  applySuggestionAction,
} from "~/server/engagement/actions";

function render(ui: React.ReactElement) {
  return rtlRender(<IntlWrapper>{ui}</IntlWrapper>);
}

vi.mock("~/server/engagement/actions", () => ({
  addCommentAction: vi.fn(),
  deleteCommentAction: vi.fn(),
  resolveCommentAction: vi.fn(),
  applySuggestionAction: vi.fn(),
}));

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const addComment = vi.mocked(addCommentAction);
const applySuggestion = vi.mocked(applySuggestionAction);

function makeComment(overrides: Partial<ThreadedComment> = {}): ThreadedComment {
  return {
    id: "comment_1",
    kind: "comment",
    body: "Turned out delicious!",
    resolvedAt: null,
    appliedAt: null,
    createdAt: new Date("2024-01-01T00:00:00.000Z"),
    parentId: null,
    author: {
      id: "user_1",
      name: "Nonna",
      handle: "nonna",
      avatarUrl: null,
    },
    replies: [],
    ...overrides,
  };
}

const baseProps = {
  recipeId: "recipe_1",
  recipeSlug: "sunday-sauce",
};

beforeEach(() => {
  vi.clearAllMocks();
  addComment.mockResolvedValue({ ok: true });
  applySuggestion.mockResolvedValue({ ok: true });
});

afterEach(cleanup);

describe("CommentsSection", () => {
  it("renders an empty state when there are no comments", () => {
    render(
      <CommentsSection
        {...baseProps}
        initialComments={[]}
        currentUserId="user_2"
        isRecipeOwner={false}
        canPost
      />,
    );

    expect(screen.getByText("Start the conversation")).toBeInTheDocument();
  });

  it("renders a comment with its author name and body", () => {
    render(
      <CommentsSection
        {...baseProps}
        initialComments={[makeComment()]}
        currentUserId="user_2"
        isRecipeOwner={false}
        canPost
      />,
    );

    expect(screen.getByText("Nonna")).toBeInTheDocument();
    expect(screen.getByText("Turned out delicious!")).toBeInTheDocument();
  });

  it("labels suggestions distinctly from plain comments", () => {
    render(
      <CommentsSection
        {...baseProps}
        initialComments={[
          makeComment({
            id: "comment_2",
            kind: "suggestion",
            body: "Try adding a bay leaf.",
          }),
        ]}
        currentUserId="user_2"
        isRecipeOwner={false}
        canPost
      />,
    );

    expect(
      within(screen.getByRole("list")).getByText("Suggestion"),
    ).toBeInTheDocument();
  });

  it("prompts sign-in and hides the form when the viewer cannot post", () => {
    render(
      <CommentsSection
        {...baseProps}
        initialComments={[]}
        currentUserId={null}
        isRecipeOwner={false}
        canPost={false}
      />,
    );

    expect(
      screen.getByText(
        "Sign in to add a comment, reply, or suggest a recipe change.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText("Leave a note for the family table…"),
    ).not.toBeInTheDocument();
  });

  it("posts a new comment through addCommentAction", async () => {
    const user = userEvent.setup();
    render(
      <CommentsSection
        {...baseProps}
        initialComments={[]}
        currentUserId="user_2"
        isRecipeOwner={false}
        canPost
      />,
    );

    await user.type(
      screen.getByPlaceholderText("Leave a note for the family table…"),
      "Making this tonight",
    );
    await user.click(screen.getByRole("button", { name: "Post" }));

    await waitFor(() =>
      expect(addComment).toHaveBeenCalledWith({
        recipeId: "recipe_1",
        recipeSlug: "sunday-sauce",
        parentId: undefined,
        kind: "comment",
        body: "Making this tonight",
      }),
    );
  });

  it("shows a delete affordance to the comment author", () => {
    render(
      <CommentsSection
        {...baseProps}
        initialComments={[makeComment()]}
        currentUserId="user_1"
        isRecipeOwner={false}
        canPost
      />,
    );

    expect(
      screen.getByRole("button", { name: "Comment actions" }),
    ).toBeInTheDocument();
  });

  it("shows a delete affordance to the recipe owner", () => {
    render(
      <CommentsSection
        {...baseProps}
        initialComments={[makeComment()]}
        currentUserId="user_2"
        isRecipeOwner
        canPost
      />,
    );

    expect(
      screen.getByRole("button", { name: "Comment actions" }),
    ).toBeInTheDocument();
  });

  it("hides the delete affordance from other members", () => {
    render(
      <CommentsSection
        {...baseProps}
        initialComments={[makeComment()]}
        currentUserId="user_2"
        isRecipeOwner={false}
        canPost
      />,
    );

    expect(
      screen.queryByRole("button", { name: "Comment actions" }),
    ).not.toBeInTheDocument();
  });

  it("offers Accept & apply to the recipe owner on an open suggestion", () => {
    render(
      <CommentsSection
        {...baseProps}
        initialComments={[
          makeComment({ id: "sugg_1", kind: "suggestion", body: "Add a bay leaf" }),
        ]}
        currentUserId="owner_9"
        isRecipeOwner
        canPost
      />,
    );

    expect(
      screen.getByRole("button", { name: /accept & apply/i }),
    ).toBeInTheDocument();
  });

  it("hides Accept & apply from non-owners", () => {
    render(
      <CommentsSection
        {...baseProps}
        initialComments={[
          makeComment({ id: "sugg_1", kind: "suggestion", body: "Add a bay leaf" }),
        ]}
        currentUserId="user_2"
        isRecipeOwner={false}
        canPost
      />,
    );

    expect(
      screen.queryByRole("button", { name: /accept & apply/i }),
    ).not.toBeInTheDocument();
  });

  it("hides Accept & apply once a suggestion is applied and shows an Applied badge", () => {
    render(
      <CommentsSection
        {...baseProps}
        initialComments={[
          makeComment({
            id: "sugg_1",
            kind: "suggestion",
            body: "Add a bay leaf",
            appliedAt: new Date("2024-02-01T00:00:00.000Z"),
            resolvedAt: new Date("2024-02-01T00:00:00.000Z"),
          }),
        ]}
        currentUserId="owner_9"
        isRecipeOwner
        canPost
      />,
    );

    expect(
      screen.queryByRole("button", { name: /accept & apply/i }),
    ).not.toBeInTheDocument();
    expect(
      within(screen.getByRole("list")).getByText("Applied"),
    ).toBeInTheDocument();
  });

  it("applies a suggestion through applySuggestionAction", async () => {
    const user = userEvent.setup();
    render(
      <CommentsSection
        {...baseProps}
        initialComments={[
          makeComment({ id: "sugg_1", kind: "suggestion", body: "Add a bay leaf" }),
        ]}
        currentUserId="owner_9"
        isRecipeOwner
        canPost
      />,
    );

    await user.click(screen.getByRole("button", { name: /accept & apply/i }));

    await waitFor(() =>
      expect(applySuggestion).toHaveBeenCalledWith({
        recipeId: "recipe_1",
        recipeSlug: "sunday-sauce",
        suggestionId: "sugg_1",
      }),
    );
  });
});
