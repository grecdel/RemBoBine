// Test du calendrier 2D : node test_calendrier.js [sortie_dump.txt]
// 1) vérifie des dates connues ; 2) écrit (option) le dump jour par jour 2026-2035 pour comparaison avec le module ;
// 3) affiche les dates de début de chaque événement par année.
const fs = require("fs"), vm = require("vm");
const ctx = {}; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(__dirname + "/../web/_calendrier.js", "utf8") + ";this.CAL_EVENTS=CAL_EVENTS;this.CAL_INFO=CAL_INFO;", ctx);
const ev = (s, p = "TOUS") => { const [y, m, d] = s.split("-").map(Number); return ctx.CAL_EVENTS(new Date(y, m - 1, d), p); };
let ok = 0, ko = 0;
const t = (s, p, id, want) => { const has = ev(s, p).includes(id); if (has === want) ok++; else { ko++; console.log(`ÉCHEC ${s} ${p} ${id} attendu ${want}, obtenu ${ev(s, p)}`); } };
[["2026-02-17", "TOUS", "nouvelanlunaire", true], ["2026-02-20", "TOUS", "nouvelanlunaire", true], ["2026-02-21", "TOUS", "nouvelanlunaire", false],
 ["2026-02-16", "CN", "nouvelanlunaire", false], ["2026-03-03", "CN", "lanternes", true], ["2030-02-02", "VN", "nouvelanlunaire", true],
 ["2030-02-02", "CN", "nouvelanlunaire", false], ["2030-02-02", "TOUS", "nouvelanlunaire", false], ["2027-02-06", "KR", "nouvelanlunaire", false],
 ["2027-02-07", "KR", "nouvelanlunaire", true], ["2027-02-06", "CN", "nouvelanlunaire", true], ["2030-02-16", "VN", "lanternes", true], ["2030-02-16", "CN", "lanternes", false], ["2028-01-30", "KR", "nouvelanlunaire", true],
 ["2026-09-25", "KR", "lune", true], ["2026-09-24", "CN", "lune", true], ["2026-09-27", "CN", "lune", false], ["2033-09-08", "TOUS", "lune", true],
 ["2034-09-25", "VN", "lune", true], ["2034-09-25", "CN", "lune", false],
 ["2026-11-08", "IN", "diwali", true], ["2026-11-06", "IN", "diwali", true], ["2026-11-11", "IN", "diwali", false], ["2026-11-08", "FR", "diwali", false],
 ["2026-03-04", "IN", "holi", true], ["2026-03-03", "IN", "holi", true], ["2026-03-05", "IN", "holi", false],
 ["2026-09-18", "DE", "oktoberfest", false], ["2026-09-19", "DE", "oktoberfest", true], ["2026-10-04", "DE", "oktoberfest", true], ["2026-10-05", "DE", "oktoberfest", false],
 ["2027-09-18", "DE", "oktoberfest", true], ["2027-10-03", "DE", "oktoberfest", true], ["2028-09-16", "DE", "oktoberfest", true], ["2028-10-03", "DE", "oktoberfest", true], ["2028-10-04", "DE", "oktoberfest", false],
 ["2026-02-17", "FR", "carnaval", true], ["2026-02-12", "FR", "carnaval", true], ["2026-02-18", "FR", "carnaval", false], ["2026-02-18", "BR", "carnavalrio", true], ["2026-02-14", "BR", "carnavalrio", true],
 ["2027-02-09", "FR", "carnaval", true], ["2026-11-26", "US", "thanksgiving_us", true], ["2026-11-25", "US", "thanksgiving_us", false], ["2026-10-12", "CA", "thanksgiving_ca", true], ["2026-10-13", "QC", "thanksgiving_ca", false],
 ["2026-12-05", "FR", "stnicolas", true], ["2026-12-06", "BE", "stnicolas", true], ["2026-12-08", "FR", "lumieres", true], ["2026-12-04", "FR", "lumieres", false], ["2026-12-13", "IT", "stelucie", true],
 ["2026-06-23", "BR", "stjean", true], ["2026-06-24", "QC", "stjean", true], ["2026-11-01", "MX", "muertos", true], ["2026-11-02", "MX", "muertos", true], ["2026-11-03", "MX", "muertos", false],
 ["2026-02-02", "US", "marmotte", true], ["2026-03-25", "JP", "hanami", true], ["2026-04-10", "JP", "hanami", true], ["2026-04-11", "JP", "hanami", false], ["2026-07-07", "JP", "tanabata", true],
 ["2026-04-13", "TH", "songkran", true], ["2026-04-15", "TH", "songkran", true], ["2026-04-16", "TH", "songkran", false],
 ["2026-03-20", "MA", "aidfitr", true], ["2026-03-22", "DZ", "aidfitr", true], ["2026-05-27", "SN", "aidadha", true], ["2026-05-30", "TN", "aidadha", true],
 ["2033-01-02", "FR", "aidfitr", true], ["2033-12-23", "FR", "aidfitr", true], ["2026-12-04", "US", "hanoukka", true], ["2026-12-11", "US", "hanoukka", true], ["2026-12-12", "US", "hanoukka", false],
 ["2027-12-31", "FR", "hanoukka", true], ["2028-01-01", "FR", "hanoukka", false], ["2026-12-05", "JP", "stnicolas", false]
].forEach(a => t(...a));
console.log(`Dates connues : ${ok} OK, ${ko} échec(s)`);
if (process.argv[2]) {
  const PAYS = ["TOUS", "FR", "BE", "CH", "LU", "MC", "QC", "CA", "US", "IE", "DE", "IT", "ES", "PT", "NL", "PL", "GR", "MA", "DZ", "TN", "SN", "CI", "CM", "HT", "MX", "BR", "JP", "CN", "IN", "KR", "VN", "TH"], out = [];
  for (let y = 2026; y <= 2035; y++) for (let m = 1; m <= 12; m++) for (let d = 1; d <= new Date(y, m, 0).getDate(); d++)
    for (const p of PAYS) out.push(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}|${p}|${ctx.CAL_EVENTS(new Date(y, m - 1, d), p).join(",")}`);
  fs.writeFileSync(process.argv[2], out.join("\n") + "\n");
  console.log("Dump écrit : " + process.argv[2] + " (" + out.length + " lignes)");
}
// Périodes affichées (premier → dernier jour) par année, pour "TOUS" et pour VN / KR quand elles diffèrent.
const fmt = dt => `${String(dt.getDate()).padStart(2, "0")}/${String(dt.getMonth() + 1).padStart(2, "0")}`;
const starts = (id, y, p) => { const r = []; for (let dt = new Date(y, 0, 1); dt.getFullYear() === y; dt.setDate(dt.getDate() + 1)) {
  const prev = new Date(dt); prev.setDate(prev.getDate() - 1);
  if (ctx.CAL_EVENTS(dt, p).includes(id) && !ctx.CAL_EVENTS(prev, p).includes(id)) {
    const e = new Date(dt); while (ctx.CAL_EVENTS(new Date(e.getFullYear(), e.getMonth(), e.getDate() + 1), p).includes(id)) e.setDate(e.getDate() + 1);
    r.push(fmt(dt) + (e - dt > 0 ? " → " + fmt(e) + (e.getFullYear() !== y ? "/" + e.getFullYear() : "") : "")); } } return r; };
const ids = Object.keys(ctx.CAL_INFO);
for (let y = 2026; y <= 2035; y++) {
  console.log(`\n== ${y} ==`);
  for (const id of ids) {
    const s = starts(id, y, "TOUS"); let extra = "";
    for (const p of ["VN", "KR"]) if (ctx.CAL_INFO[id].pays.includes(p)) { const sp = starts(id, y, p); if (sp.join() !== s.join()) extra += `  [${p} : ${sp.join(", ")}]`; }
    console.log(`  ${id.padEnd(16)} ${s.join(", ") || "-"}${extra}`);
  }
}
