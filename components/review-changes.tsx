import type { Version } from "@/lib/domain";
function changedRegion(before: string, after: string) {
  const a = Array.from(before),
    b = Array.from(after);
  let start = 0,
    end = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  while (
    end < a.length - start &&
    end < b.length - start &&
    a[a.length - 1 - end] === b[b.length - 1 - end]
  )
    end++;
  const split = (v: string[]) => [
    v.slice(0, start).join(""),
    v.slice(start, v.length - end).join(""),
    end ? v.slice(-end).join("") : "",
  ];
  return { before: split(a), after: split(b) };
}
export function ReviewChanges({
  previous,
  current,
}: {
  previous?: Version;
  current: Version;
}) {
  if (!previous)
    return (
      <div className="review-changes empty">
        <h3>No earlier version</h3>
        <p>
          This is the original submission. Saved revisions will show the
          complete before and after copy here.
        </p>
      </div>
    );
  const changes = changedRegion(previous.content, current.content);
  return (
    <div className="review-changes">
      <div className="changes-heading">
        <h3>What changed in v{current.number}</h3>
        <p>
          {previous.content === current.content
            ? "The copy is unchanged. This version may have been created to rerun a precheck."
            : "Highlighted text marks the changed region. Read the full copy in context before deciding."}
        </p>
      </div>
      <div className="changes-columns">
        <section>
          <h4>Before · v{previous.number}</h4>
          <p>
            {changes.before[0]}
            <del>{changes.before[1]}</del>
            {changes.before[2]}
          </p>
        </section>
        <section>
          <h4>After · v{current.number}</h4>
          <p>
            {changes.after[0]}
            <ins>{changes.after[1]}</ins>
            {changes.after[2]}
          </p>
        </section>
      </div>
      <p className="changes-note">
        Comparison of saved versions. A text change is not a compliance
        decision.
      </p>
    </div>
  );
}
