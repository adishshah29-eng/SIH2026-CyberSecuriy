import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import type { StakeholderRole } from "@/lib/supabase/types";

const ROLE_META: Record<StakeholderRole, { label: string; icon: string }> = {
  collector: { label: "Collectors", icon: "👨‍🌾" },
  processor: { label: "Processing Units", icon: "🏭" },
  lab: { label: "Laboratories", icon: "🧪" },
  manufacturer: { label: "Manufacturers", icon: "💊" },
};

const ROLE_ORDER: StakeholderRole[] = ["collector", "processor", "lab", "manufacturer"];

export default async function StakeholdersPage() {
  const supabase = await createClient();
  const { data: stakeholders } = await supabase
    .from("stakeholders")
    .select("id, code, role, name, location, verified")
    .order("role")
    .order("code");

  const all = stakeholders ?? [];
  const counts = ROLE_ORDER.map((role) => ({
    role,
    count: all.filter((s) => s.role === role).length,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-neutral-900">Stakeholders</h1>
        <p className="text-sm text-neutral-500">Everyone participating in the Ashwagandha supply chain</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {counts.map(({ role, count }) => (
          <Card key={role}>
            <CardContent className="flex items-center gap-3 py-4">
              <span className="text-2xl">{ROLE_META[role].icon}</span>
              <div>
                <p className="text-2xl font-semibold text-neutral-900">{count}</p>
                <p className="text-sm text-neutral-500">{ROLE_META[role].label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {all.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.code}</TableCell>
                  <TableCell>{s.name}</TableCell>
                  <TableCell className="capitalize">
                    {ROLE_META[s.role].icon} {s.role}
                  </TableCell>
                  <TableCell className="text-neutral-500">{s.location}</TableCell>
                  <TableCell>
                    {s.verified ? (
                      <Badge variant="success">✅ Verified</Badge>
                    ) : (
                      <Badge variant="neutral">Unverified</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
