import { sanitizeHtml } from "../src/lib/sanitize";

const cases: Array<[string, string, (out: string) => boolean]> = [
  [
    "keeps geometry",
    `<div style="left:12.5%;top:8%;width:40%;font-size:30pt">x</div>`,
    (o) => o.includes("left:") && o.includes("font-size"),
  ],
  [
    "keeps data-path",
    `<p data-path="lead" data-layout="CARDS">x</p>`,
    (o) => o.includes("data-path") && o.includes("data-layout"),
  ],
  ["drops comments", `<div>a<!-- secret -->b</div>`, (o) => !o.includes("secret")],
  [
    "blocks javascript: url",
    `<a href="javascript:alert(1)">x</a>`,
    (o) => !o.includes("javascript:"),
  ],
  [
    "blocks style url()",
    `<div style="background:url(http://evil/x.png)">x</div>`,
    (o) => !o.includes("url("),
  ],
  [
    "blocks expression()",
    `<div style="width:expression(alert(1))">x</div>`,
    (o) => !o.includes("expression("),
  ],
  [
    "blocks -moz-binding",
    `<div style="-moz-binding:url(x)">x</div>`,
    (o) => !o.includes("binding"),
  ],
  ["strips script", `<div>ok</div><script>alert(1)</script>`, (o) => !o.includes("alert(1)")],
  ["strips onclick", `<div onclick="alert(1)">x</div>`, (o) => !o.includes("onclick")],
];

let failed = 0;
for (const [name, input, check] of cases) {
  const out = sanitizeHtml(input);
  const pass = typeof out === "string" && check(out);
  if (!pass) failed++;
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}\n      -> ${out}`);
}
console.log(failed === 0 ? "\nsanitizer: all checks passed" : `\nsanitizer: ${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
