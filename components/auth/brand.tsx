import Link from "next/link";
import { Layers3 } from "lucide-react";
export function Brand() {
  return (
    <Link href="/" className="brand">
      <span className="logo">
        <Layers3 size={20} />
      </span>
      ClearPath<span className="brand-sub">REVIEW</span>
    </Link>
  );
}
