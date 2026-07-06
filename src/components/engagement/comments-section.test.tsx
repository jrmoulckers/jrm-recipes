import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CommentsSection } from "./comments-section";
import type { ThreadedComment } from "~/server/engagement/queries";
import { addCommentAction } from "~/server/engagement/actions";

vi.mock("~/server/engagement/actions", () => ({
  addCommentAction: vi.fn(),
  deleteCommentAction: vi.fn(),
  resolveCommentAction: vi.fn(),
}));

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const addComment = vi.mocked(addCommentAction);

function makeComment(overrides: Partial<ThreadedComment> = {}): ThreadedComment {
  return {
    id: "comment_1",
    kind: "comment",
    body: "Turned out delicious!",
    resolvedAt: null,
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
});
