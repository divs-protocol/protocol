import { notFound } from "next/navigation";
import AppShell from "../_components/AppShell";
import { SECTIONS } from "@/lib/sections";

/** Every section is prerendered, so each URL is a real static page. */
export function generateStaticParams() {
  return SECTIONS.map((section) => ({ section }));
}

export default async function Page({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!(SECTIONS as readonly string[]).includes(section)) notFound();
  return <AppShell section={section} />;
}
