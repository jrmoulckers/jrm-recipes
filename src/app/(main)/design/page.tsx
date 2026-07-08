"use client";

import * as React from "react";
import { Inbox, Plus, Search, Trash2 } from "lucide-react";

import { useTheme } from "~/components/theme/theme-provider";
import { ThemeSwitcher } from "~/components/theme/theme-switcher";
import { ThemeSwatch } from "~/components/theme/theme-swatch";
import { UI_THEMES } from "~/config/themes";
import { Avatar, AvatarFallback } from "~/components/ui/avatar";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { EmptyState } from "~/components/ui/empty-state";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Separator } from "~/components/ui/separator";
import {
  ListRowSkeleton,
  RecipeCardSkeleton,
  Skeleton,
} from "~/components/ui/skeleton";
import { Slider } from "~/components/ui/slider";
import { Spinner } from "~/components/ui/spinner";
import { Switch } from "~/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { Textarea } from "~/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { Heading, Text } from "~/components/ui/typography";
import { cn } from "~/lib/utils";

/**
 * Design-system gallery (issue #83). A dev/reference route — deliberately NOT
 * linked in the production nav — that renders every `ui` primitive in its key
 * states plus the live token palette. Pair it with the header's ThemeSwitcher
 * (also embedded below) to flip mode + scheme and QA every combination in
 * place. Everything is token-driven, so it doubles as a cross-mode contrast /
 * spacing / radius / elevation regression check.
 */

/** Read a CSS custom property off <html>, re-reading when mode/scheme change. */
function useCssVar(name: string): string {
  const { theme, resolvedScheme } = useTheme();
  const [value, setValue] = React.useState("");
  React.useEffect(() => {
    const raw = getComputedStyle(document.documentElement)
      .getPropertyValue(name)
      .trim();
    setValue(raw);
  }, [name, theme, resolvedScheme]);
  return value;
}

function VarValue({ name }: { name: string }) {
  const value = useCssVar(name);
  return (
    <code className="block truncate font-mono text-xs text-muted-foreground">
      {value || "\u00a0"}
    </code>
  );
}

function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="flex scroll-mt-24 flex-col gap-5">
      <div className="flex flex-col gap-1">
        <Heading level={2} size="h3">
          {title}
        </Heading>
        {description ? <Text variant="muted">{description}</Text> : null}
      </div>
      {children}
    </section>
  );
}

const COLOR_SWATCHES: { label: string; varName: string; box: string; text: string }[] =
  [
    { label: "background", varName: "--background", box: "bg-background", text: "text-foreground" },
    { label: "foreground", varName: "--foreground", box: "bg-foreground", text: "text-background" },
    { label: "surface", varName: "--surface", box: "bg-surface", text: "text-surface-foreground" },
    { label: "surface-muted", varName: "--surface-muted", box: "bg-surface-muted", text: "text-surface-foreground" },
    { label: "card", varName: "--card", box: "bg-card", text: "text-card-foreground" },
    { label: "popover", varName: "--popover", box: "bg-popover", text: "text-popover-foreground" },
    { label: "primary", varName: "--primary", box: "bg-primary", text: "text-primary-foreground" },
    { label: "secondary", varName: "--secondary", box: "bg-secondary", text: "text-secondary-foreground" },
    { label: "muted", varName: "--muted", box: "bg-muted", text: "text-muted-foreground" },
    { label: "accent", varName: "--accent", box: "bg-accent", text: "text-accent-foreground" },
    { label: "destructive", varName: "--destructive", box: "bg-destructive", text: "text-destructive-foreground" },
    { label: "success", varName: "--success", box: "bg-success", text: "text-success-foreground" },
    { label: "warning", varName: "--warning", box: "bg-warning", text: "text-warning-foreground" },
    { label: "info", varName: "--info", box: "bg-info", text: "text-info-foreground" },
  ];

const LINE_TOKENS: { label: string; varName: string; cls: string }[] = [
  { label: "border", varName: "--border", cls: "border-4 border-border" },
  { label: "input", varName: "--input", cls: "border-4 border-input" },
  { label: "ring", varName: "--ring", cls: "ring-4 ring-ring ring-offset-2 ring-offset-background" },
];

const RADIUS_STEPS: { label: string; cls: string }[] = [
  { label: "sm", cls: "rounded-sm" },
  { label: "md", cls: "rounded-md" },
  { label: "lg", cls: "rounded-lg" },
  { label: "xl", cls: "rounded-xl" },
  { label: "2xl", cls: "rounded-2xl" },
];

const ELEVATION_STEPS: { label: string; varName: string; cls: string }[] = [
  { label: "token-sm", varName: "--shadow-sm", cls: "shadow-token-sm" },
  { label: "token", varName: "--shadow", cls: "shadow-token" },
  { label: "token-lg", varName: "--shadow-lg", cls: "shadow-token-lg" },
];

const BUTTON_VARIANTS = [
  "default",
  "secondary",
  "accent",
  "outline",
  "ghost",
  "destructive",
  "link",
] as const;

const BADGE_VARIANTS = [
  "default",
  "secondary",
  "accent",
  "success",
  "warning",
  "info",
  "destructive",
  "outline",
  "muted",
] as const;

export default function DesignGalleryPage() {
  return (
    <div className="container flex flex-col gap-12 py-10">
      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-2">
            <Badge variant="muted" className="w-fit">
              Dev / reference
            </Badge>
            <Heading level={1}>Design system</Heading>
            <Text variant="muted" className="max-w-2xl">
              Every primitive and token in one place. Flip the mode and lighting
              with the switcher to QA all five modes in light and dark — nothing
              here needs data, auth, or a database.
            </Text>
          </div>
          <ThemeSwitcher />
        </div>
      </header>

      <Section
        id="colors"
        title="Color tokens"
        description="Semantic surfaces and their paired foregrounds, read live from CSS variables."
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {COLOR_SWATCHES.map((t) => (
            <div
              key={t.label}
              className="flex flex-col gap-2 rounded-xl border border-border bg-card p-2"
            >
              <div
                className={cn(
                  "flex h-16 items-center justify-center rounded-lg border border-border",
                  t.box,
                  t.text,
                )}
              >
                <span className="text-sm font-medium">Aa</span>
              </div>
              <div className="px-1">
                <p className="text-sm font-medium text-card-foreground">
                  {t.label}
                </p>
                <VarValue name={t.varName} />
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {LINE_TOKENS.map((t) => (
            <div
              key={t.label}
              className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3"
            >
              <div
                className={cn("h-12 rounded-lg bg-background", t.cls)}
                aria-hidden="true"
              />
              <div>
                <p className="text-sm font-medium text-card-foreground">
                  {t.label}
                </p>
                <VarValue name={t.varName} />
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section
        id="radius"
        title="Radius scale"
        description="All steps derive from a single --radius token."
      >
        <div className="flex flex-wrap gap-4">
          {RADIUS_STEPS.map((r) => (
            <div key={r.label} className="flex flex-col items-center gap-2">
              <div
                className={cn(
                  "size-20 border border-border bg-primary/12",
                  r.cls,
                )}
                aria-hidden="true"
              />
              <code className="font-mono text-xs text-muted-foreground">
                rounded-{r.label}
              </code>
            </div>
          ))}
        </div>
      </Section>

      <Section
        id="elevation"
        title="Elevation scale"
        description="Tokenized shadows that adapt per mode and scheme."
      >
        <div className="flex flex-wrap gap-6">
          {ELEVATION_STEPS.map((e) => (
            <div key={e.label} className="flex flex-col items-center gap-2">
              <div
                className={cn(
                  "flex size-24 items-center justify-center rounded-xl border border-border bg-card",
                  e.cls,
                )}
              >
                <span className="text-xs text-muted-foreground">{e.label}</span>
              </div>
              <div className="w-40 text-center">
                <VarValue name={e.varName} />
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section
        id="typography"
        title="Type scale"
        description="Heading and Text primitives on the tokenized rem scale."
      >
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-6">
          <Heading level={1} size="display">
            Display
          </Heading>
          <Heading level={1}>Heading 1</Heading>
          <Heading level={2}>Heading 2</Heading>
          <Heading level={3}>Heading 3</Heading>
          <Heading level={4}>Heading 4</Heading>
          <Text>Body — the quick brown fox jumps over the lazy dog.</Text>
          <Text variant="muted">Muted body — secondary supporting copy.</Text>
          <Text variant="small">Small — captions and helper text.</Text>
        </div>
      </Section>

      <Section id="buttons" title="Buttons" description="Variants, sizes, and states.">
        <div className="flex flex-wrap gap-3">
          {BUTTON_VARIANTS.map((v) => (
            <Button key={v} variant={v}>
              {v}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm">Small</Button>
          <Button size="default">Default</Button>
          <Button size="lg">Large</Button>
          <Button size="xl">XL</Button>
          <Button size="icon" aria-label="Add">
            <Plus className="size-5" />
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button loading>Saving</Button>
          <Button variant="outline" loading>
            Loading
          </Button>
          <Button disabled>Disabled</Button>
          <Button variant="outline" disabled>
            Disabled
          </Button>
        </div>
      </Section>

      <Section id="badges" title="Badges" description="Status and emphasis variants.">
        <div className="flex flex-wrap gap-2">
          {BADGE_VARIANTS.map((v) => (
            <Badge key={v} variant={v}>
              {v}
            </Badge>
          ))}
        </div>
      </Section>

      <Section id="cards" title="Card">
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Weeknight ragù</CardTitle>
              <CardDescription>Slow-simmered, freezer-friendly.</CardDescription>
            </CardHeader>
            <CardContent>
              <Text variant="muted">
                Cards compose the Heading/Text primitives and tokenized elevation.
              </Text>
            </CardContent>
            <CardFooter className="gap-2">
              <Button size="sm">Open</Button>
              <Button size="sm" variant="outline">
                Save
              </Button>
            </CardFooter>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>With badges</CardTitle>
              <CardDescription>Status chips read from tokens.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Badge variant="success">Fresh</Badge>
              <Badge variant="warning">Low stock</Badge>
              <Badge variant="info">New</Badge>
            </CardContent>
          </Card>
        </div>
      </Section>

      <Section id="forms" title="Form controls" description="Inputs, selects, and validation.">
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="dg-name">Name</Label>
            <Input id="dg-name" placeholder="Grandma's biscuits" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="dg-search">With icon</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input id="dg-search" className="pl-9" placeholder="Search recipes" />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="dg-invalid">Error state</Label>
            <Input
              id="dg-invalid"
              aria-invalid
              defaultValue="not-an-email"
              className="border-destructive focus-visible:ring-destructive"
            />
            <Text variant="small" className="text-destructive">
              Enter a valid email address.
            </Text>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="dg-disabled">Disabled</Label>
            <Input id="dg-disabled" disabled placeholder="Unavailable" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="dg-select">Select</Label>
            <Select>
              <SelectTrigger id="dg-select" className="w-full">
                <SelectValue placeholder="Pick a course" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="starter">Starter</SelectItem>
                <SelectItem value="main">Main</SelectItem>
                <SelectItem value="dessert">Dessert</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label htmlFor="dg-notes">Notes</Label>
            <Textarea id="dg-notes" placeholder="Method, tweaks, family notes…" />
          </div>
        </div>
      </Section>

      <Section id="toggles" title="Switch & Slider">
        <div className="flex flex-wrap items-center gap-8">
          <div className="flex items-center gap-3">
            <Switch id="dg-sw-on" defaultChecked aria-label="On" />
            <Label htmlFor="dg-sw-on">On</Label>
          </div>
          <div className="flex items-center gap-3">
            <Switch id="dg-sw-off" aria-label="Off" />
            <Label htmlFor="dg-sw-off">Off</Label>
          </div>
          <div className="flex items-center gap-3">
            <Switch id="dg-sw-dis" disabled aria-label="Disabled" />
            <Label htmlFor="dg-sw-dis">Disabled</Label>
          </div>
          <Slider
            defaultValue={[40]}
            max={100}
            step={1}
            className="w-64"
            aria-label="Example slider"
          />
        </div>
      </Section>

      <Section id="tabs" title="Tabs">
        <Tabs defaultValue="ingredients" className="w-full max-w-md">
          <TabsList>
            <TabsTrigger value="ingredients">Ingredients</TabsTrigger>
            <TabsTrigger value="method">Method</TabsTrigger>
            <TabsTrigger value="notes">Notes</TabsTrigger>
          </TabsList>
          <TabsContent value="ingredients">
            <Text variant="muted">Flour, butter, buttermilk, salt.</Text>
          </TabsContent>
          <TabsContent value="method">
            <Text variant="muted">Fold, chill, cut, bake hot.</Text>
          </TabsContent>
          <TabsContent value="notes">
            <Text variant="muted">Don&apos;t twist the cutter.</Text>
          </TabsContent>
        </Tabs>
      </Section>

      <Section id="overlays" title="Overlays" description="Dialog, dropdown, popover, and tooltips.">
        <div className="flex flex-wrap items-center gap-3">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline">Open dialog</Button>
            </DialogTrigger>
            <DialogContent size="md">
              <DialogHeader>
                <DialogTitle>Delete recipe?</DialogTitle>
                <DialogDescription>
                  This can&apos;t be undone. The recipe leaves every collection it&apos;s in.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">Cancel</Button>
                </DialogClose>
                <DialogClose asChild>
                  <Button variant="destructive">Delete</Button>
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">Open menu</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel>Recipe</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem>Edit</DropdownMenuItem>
              <DropdownMenuItem>Duplicate</DropdownMenuItem>
              <DropdownMenuItem className="text-destructive">
                <Trash2 className="size-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline">Open popover</Button>
            </PopoverTrigger>
            <PopoverContent className="flex flex-col gap-2">
              <Heading level={4} size="h4">
                Quick note
              </Heading>
              <Text variant="small">
                Popovers share the overlay surface — radius, padding, elevation.
              </Text>
            </PopoverContent>
          </Popover>

          <TooltipProvider delayDuration={150}>
            <div className="flex flex-wrap items-center gap-3">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline">Default tip</Button>
                </TooltipTrigger>
                <TooltipContent>Save to collection</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline">Soft tip</Button>
                </TooltipTrigger>
                <TooltipContent variant="soft">
                  A calmer surface-toned tooltip
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline">Multiline</Button>
                </TooltipTrigger>
                <TooltipContent multiline>
                  A longer tooltip that wraps onto several lines to explain a
                  control without truncating.
                </TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>
        </div>
      </Section>

      <Section id="avatar" title="Avatar & Separator">
        <div className="flex items-center gap-4">
          <Avatar>
            <AvatarFallback>JM</AvatarFallback>
          </Avatar>
          <Avatar>
            <AvatarFallback>AB</AvatarFallback>
          </Avatar>
          <Separator orientation="vertical" className="h-8" />
          <Text variant="muted">Separators divide content.</Text>
        </div>
        <Separator />
      </Section>

      <Section id="feedback" title="Spinner, Skeleton & EmptyState">
        <div className="flex items-center gap-6">
          <Spinner label="Loading" className="text-2xl text-primary" />
          <Spinner className="text-4xl text-muted-foreground" />
          <Button loading>Working</Button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <RecipeCardSkeleton />
          <ListRowSkeleton />
        </div>
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton shimmer={false} className="h-4 w-1/3" />
        </div>

        <EmptyState
          icon={<Inbox />}
          title="No recipes yet"
          description="Add your first family recipe and it'll show up here."
          action={
            <Button>
              <Plus className="size-4" />
              Add recipe
            </Button>
          }
        />
      </Section>

      <Section
        id="theme-swatches"
        title="Theme swatches"
        description="Each mode's primary/secondary/accent, scheme-aware."
      >
        <div className="flex flex-wrap gap-6">
          {UI_THEMES.map((t) => (
            <div key={t.id} className="flex flex-col items-center gap-2">
              <ThemeSwatch theme={t.id} size="lg" />
              <code className="font-mono text-xs text-muted-foreground">
                {t.id}
              </code>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
