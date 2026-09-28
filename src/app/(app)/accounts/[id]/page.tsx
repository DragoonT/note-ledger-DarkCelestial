import { AuthenticatedApp } from "@/components/app/AuthenticatedApp";

export default async function AccountDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AuthenticatedApp page="transactions" accountId={id} />;
}
