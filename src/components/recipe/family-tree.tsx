import Link from "next/link";
import { GitFork } from "lucide-react";

import type { FamilyTreeNode, RecipeFamilyTree } from "~/server/recipes/queries";

/**
 * Multi-generation adaptation tree for a recipe (#359): renders the ancestor
 * spine (root → … → current) with the current recipe's descendants fanned out
 * beneath it, the current recipe highlighted and every other node linking to its
 * detail page. Callers only render this when {@link RecipeFamilyTree.multiGeneration}
 * is true; a single-generation recipe uses the simpler `RecipeLineage` view.
 */
export function RecipeFamilyTree({ tree }: { tree: RecipeFamilyTree }) {
  return (
    <section
      className="rounded-xl border border-border bg-card p-4 shadow-token"
      aria-label="Recipe family tree"
    >
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <GitFork className="size-4 text-primary" aria-hidden="true" />
        Family tree
      </h3>
      <ul className="mt-3">
        <TreeNode node={tree.root} depth={0} />
      </ul>
      {tree.truncated && (
        <p className="mt-3 text-xs text-muted-foreground">
          Showing the closest generations — some adaptations aren&apos;t shown.
        </p>
      )}
    </section>
  );
}

function TreeNode({ node, depth }: { node: FamilyTreeNode; depth: number }) {
  const label = (
    <span className="inline-flex min-w-0 flex-col">
      <span className="truncate font-medium">{node.title}</span>
      {node.author?.name && (
        <span className="truncate text-xs text-muted-foreground">
          by {node.author.name}
        </span>
      )}
    </span>
  );

  return (
    <li className={depth > 0 ? "mt-2 border-l border-border/70 pl-4" : undefined}>
      <div className="flex items-center gap-2">
        <GitFork
          className="size-3.5 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
        {node.isCurrent ? (
          <span
            className="inline-flex min-w-0 items-center gap-2 rounded-md bg-primary/10 px-2 py-1 text-primary"
            aria-current="true"
          >
            {label}
          </span>
        ) : (
          <Link
            href={`/recipes/${node.slug}`}
            className="inline-flex min-w-0 rounded-md px-2 py-1 underline-offset-4 hover:bg-primary/5 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {label}
          </Link>
        )}
      </div>

      {(node.children.length > 0 || node.hiddenChildren > 0) && (
        <ul>
          {node.children.map((child) => (
            <TreeNode key={child.id} node={child} depth={depth + 1} />
          ))}
          {node.hiddenChildren > 0 && (
            <li className="mt-2 border-l border-border/70 pl-4 text-xs text-muted-foreground">
              +{node.hiddenChildren} more{" "}
              {node.hiddenChildren === 1 ? "adaptation" : "adaptations"}
            </li>
          )}
        </ul>
      )}
    </li>
  );
}
