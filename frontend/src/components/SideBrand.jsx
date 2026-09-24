export default function SideBrand() {
  let delayIndex = 0;
  return (
    <div className="side-brand" aria-hidden="true">
      {["Quick", "Ride"].map((word, wi) => (
        <div className="side-brand-word" key={wi}>
          {word.split("").map((ch, i) => {
            const d = delayIndex++;
            return (
              <span key={i} style={{ animationDelay: `${d * 0.09}s` }}>{ch}</span>
            );
          })}
        </div>
      ))}
    </div>
  );
}