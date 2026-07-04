import { Baby, Crown, Shield, Users } from "lucide-react";

import { Badge } from "~/components/ui/badge";
import { cn } from "~/lib/utils";

export type DisplayRole = "owner" | "admin" | "member" | "kid";

const ROLE_DETAILS = {
  owner: { label: "Owner", icon: Crown, variant: "default" },
  admin: { label: "Admin", icon: Shield, variant: "secondary" },
  member: { label: "Member", icon: Users, variant: "muted" },
  kid: { label: "Kid", icon: Baby, variant: "accent" },
} as const;

export function roleLabel(role: DisplayRole) {
  return ROLE_DETAILS[role].label;
}

export function RoleBadge({
  role,
  className,
}: {
  role: DisplayRole;
  className?: string;
}) {
  const detail = ROLE_DETAILS[role];
  const Icon = detail.icon;

  return (
    <Badge variant={detail.variant} className={cn("capitalize", className)}>
      <Icon className="size-3.5" aria-hidden="true" />
      {detail.label}
    </Badge>
  );
}
