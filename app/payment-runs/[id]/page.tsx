import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function PaymentRunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/print/payment-run?id=${encodeURIComponent(id)}`);
}
