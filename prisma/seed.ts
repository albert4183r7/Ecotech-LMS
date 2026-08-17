import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ============================================================
// Helper: wrap body HTML in a full document for iframe rendering
// ============================================================
function wrapHtml(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${title}</title>
<script src="https://cdn.tailwindcss.com"></script>
<style>body { margin: 0; padding: 0; font-family: system-ui, -apple-system, sans-serif; }
* { box-sizing: border-box; }</style>
</head>
<body class="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">
${body}
</body>
</html>`;
}

async function main() {
  console.log("Seeding LMS database...\n");

  // Clean existing data
  await prisma.notification.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.favorite.deleteMany();
  await prisma.progress.deleteMany();
  await prisma.enrollment.deleteMany();
  await prisma.section.deleteMany();
  await prisma.course.deleteMany();
  await prisma.category.deleteMany();
  await prisma.user.deleteMany();

  // ============================================
  // Create users (instructor + students)
  // ============================================
  const user = await prisma.user.create({
    data: { id: "user_instructor_001", email: "instructor@ecotech.com", password: "instructor123", name: "Dr. Sarah Chen", avatar: null, role: "instructor", department: "Faculty" },
  });
  console.log(`Created user: ${user.name}`);

  const student1 = await prisma.user.create({
    data: { id: "user_student_001", email: "alex.student@ecotech.com", password: "student123", name: "Alex Johnson", avatar: null, role: "student", department: "Computer Science" },
  });

  const student2 = await prisma.user.create({
    data: { id: "user_student_002", email: "maria.student@ecotech.com", password: "student123", name: "Maria Garcia", avatar: null, role: "student", department: "Data Science" },
  });
  console.log(`Created students: ${student1.name}, ${student2.name}`);

  // ============================================
  // Create categories
  // ============================================
  const categories = await Promise.all([
    prisma.category.create({ data: { id: "cat_001", name: "Subject Education", description: "Core academic subjects and foundational knowledge", color: "#0d9488" } }),
    prisma.category.create({ data: { id: "cat_002", name: "Life Skills", description: "Practical skills for everyday life", color: "#d97706" } }),
    prisma.category.create({ data: { id: "cat_003", name: "Business Knowledge", description: "Business acumen and professional skills", color: "#e11d48" } }),
    prisma.category.create({ data: { id: "cat_004", name: "Technology", description: "Technical skills and IT knowledge", color: "#7c3aed" } }),
    prisma.category.create({ data: { id: "cat_005", name: "Communication", description: "Writing, speaking, and interpersonal skills", color: "#059669" } }),
    prisma.category.create({ data: { id: "cat_006", name: "Safety & Compliance", description: "Workplace safety and regulatory compliance", color: "#dc2626" } }),
  ]);
  console.log(`Created ${categories.length} categories`);

  // ============================================
  // Course seed data (5 courses x 5 sections)
  // ============================================
  const courseSeeds: Array<{
    id: string; title: string; description: string; categoryId: string;
    coverImage: string; language: string; studentCount: number; rating: number;
    sections: { id: string; title: string; totalPages: number; content: string; htmlBody: string }[];
  }> = [
    // ========================================
    // Course 1: Mathematical Thinking
    // ========================================
    {
      id: "course_001",
      title: "Mathematical Thinking",
      description: "Develop logical reasoning and problem-solving skills through mathematical concepts. Learn to approach complex problems systematically and build strong analytical foundations.",
      categoryId: "cat_001",
      coverImage: "https://placehold.co/800x450/0d9488/white?text=Mathematical+Thinking",
      language: "english",
      studentCount: 142,
      rating: 4.5,
      sections: [
        {
          id: "sec_001",
          title: "Introduction to Logical Reasoning",
          totalPages: 1,
          content: JSON.stringify([
            { title: "Introduction to Logical Reasoning", type: "title", subtitle: "Building the foundation for mathematical thinking" },
            { title: "What You will Learn", type: "list", items: [
              { text: "The three pillars of logical reasoning" },
              { text: "How to identify and avoid logical fallacies" },
              { text: "Applying structured thinking to real problems" },
            ]},
          ]),
          htmlBody: wrapHtml("Introduction to Logical Reasoning", `
<div class="min-h-screen flex items-center justify-center p-8">
  <div class="max-w-4xl w-full text-center space-y-10">
    <div class="inline-block px-4 py-1.5 rounded-full bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 text-sm font-medium tracking-wide uppercase">Module 1</div>
    <h1 class="text-5xl font-extrabold leading-tight">
      <span class="bg-gradient-to-r from-teal-600 to-cyan-500 bg-clip-text text-transparent">Introduction to</span><br/>
      <span class="text-zinc-900 dark:text-zinc-100">Logical Reasoning</span>
    </h1>
    <p class="text-xl text-zinc-500 dark:text-zinc-400 max-w-2xl mx-auto">Building the foundation for mathematical thinking and analytical problem solving</p>
    <div class="grid grid-cols-3 gap-6 pt-4">
      <div class="bg-zinc-50 dark:bg-zinc-800 rounded-2xl p-6 space-y-3">
        <div class="w-12 h-12 mx-auto rounded-xl bg-teal-100 dark:bg-teal-900/50 flex items-center justify-center text-teal-600 text-xl font-bold">D</div>
        <h3 class="font-semibold text-lg">Deductive</h3>
        <p class="text-sm text-zinc-500 dark:text-zinc-400">General to Specific</p>
      </div>
      <div class="bg-zinc-50 dark:bg-zinc-800 rounded-2xl p-6 space-y-3">
        <div class="w-12 h-12 mx-auto rounded-xl bg-cyan-100 dark:bg-cyan-900/50 flex items-center justify-center text-cyan-600 text-xl font-bold">I</div>
        <h3 class="font-semibold text-lg">Inductive</h3>
        <p class="text-sm text-zinc-500 dark:text-zinc-400">Specific to General</p>
      </div>
      <div class="bg-zinc-50 dark:bg-zinc-800 rounded-2xl p-6 space-y-3">
        <div class="w-12 h-12 mx-auto rounded-xl bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center text-emerald-600 text-xl font-bold">A</div>
        <h3 class="font-semibold text-lg">Abductive</h3>
        <p class="text-sm text-zinc-500 dark:text-zinc-400">Best Explanation</p>
      </div>
    </div>
  </div>
</div>`),
        },
        {
          id: "sec_002",
          title: "Deductive and Inductive Reasoning",
          totalPages: 1,
          content: JSON.stringify([
            { title: "Deductive and Inductive Reasoning", type: "content", items: [
              { heading: "Deductive Reasoning", text: "Starts with a general premise and reaches a specific conclusion. If premises are true, conclusion must be true." },
              { heading: "Inductive Reasoning", text: "Observes specific instances and draws a general conclusion. Conclusions are probable but not guaranteed." },
            ]},
          ]),
          htmlBody: wrapHtml("Deductive and Inductive Reasoning", `
<div class="min-h-screen flex items-center justify-center p-8">
  <div class="max-w-5xl w-full space-y-8">
    <h1 class="text-3xl font-bold">Deductive &amp; Inductive Reasoning</h1>
    <div class="grid grid-cols-2 gap-8">
      <div class="rounded-2xl border-2 border-teal-200 dark:border-teal-800 p-8 space-y-4">
        <h2 class="text-2xl font-bold text-teal-700 dark:text-teal-400">Deductive</h2>
        <p class="text-zinc-600 dark:text-zinc-400">General premise to Specific conclusion</p>
        <div class="bg-zinc-50 dark:bg-zinc-800 rounded-xl p-4 space-y-2 text-sm">
          <p><strong>Premise:</strong> All humans are mortal.</p>
          <p><strong>Premise:</strong> Socrates is human.</p>
          <p><strong>Conclusion:</strong> Socrates is mortal.</p>
        </div>
        <p class="text-sm text-zinc-500">Conclusion <em>must</em> be true if premises are true.</p>
      </div>
      <div class="rounded-2xl border-2 border-amber-200 dark:border-amber-800 p-8 space-y-4">
        <h2 class="text-2xl font-bold text-amber-700 dark:text-amber-400">Inductive</h2>
        <p class="text-zinc-600 dark:text-zinc-400">Specific observations to General conclusion</p>
        <div class="bg-zinc-50 dark:bg-zinc-800 rounded-xl p-4 space-y-2 text-sm">
          <p><strong>Obs:</strong> Swan 1 is white.</p>
          <p><strong>Obs:</strong> Swan 2 is white.</p>
          <p><strong>Conclusion:</strong> All swans are white.</p>
        </div>
        <p class="text-sm text-zinc-500">Conclusions are <em>probable</em>, not guaranteed.</p>
      </div>
    </div>
  </div>
</div>`),
        },
        {
          id: "sec_003",
          title: "Patterns and Sequences",
          totalPages: 1,
          content: JSON.stringify([
            { title: "Patterns and Sequences", type: "content", items: [
              { heading: "Arithmetic Sequences", text: "Each term differs by a constant d. Formula: an = a1 + (n-1)d" },
              { heading: "Geometric Sequences", text: "Each term multiplied by constant r. Formula: an = a1 * r^(n-1)" },
              { heading: "Fibonacci Sequence", text: "1, 1, 2, 3, 5, 8, 13... Found throughout nature." },
            ]},
          ]),
          htmlBody: wrapHtml("Patterns and Sequences", `
<div class="min-h-screen flex items-center justify-center p-8">
  <div class="max-w-5xl w-full space-y-8">
    <h1 class="text-3xl font-bold">Patterns &amp; Sequences</h1>
    <div class="grid grid-cols-3 gap-6">
      <div class="bg-gradient-to-br from-teal-50 to-cyan-50 dark:from-teal-950/30 dark:to-cyan-950/30 rounded-2xl p-6 space-y-3">
        <h2 class="text-lg font-bold text-teal-700 dark:text-teal-400">Arithmetic</h2>
        <p class="text-sm text-zinc-600 dark:text-zinc-400">Constant difference</p>
        <div class="bg-white/70 dark:bg-zinc-900/50 rounded-lg p-3 font-mono text-center text-lg">2, 5, 8, 11, 14...</div>
        <p class="text-xs text-center text-zinc-500">an = a1 + (n-1)d</p>
      </div>
      <div class="bg-gradient-to-br from-violet-50 to-purple-50 dark:from-violet-950/30 dark:to-purple-950/30 rounded-2xl p-6 space-y-3">
        <h2 class="text-lg font-bold text-violet-700 dark:text-violet-400">Geometric</h2>
        <p class="text-sm text-zinc-600 dark:text-zinc-400">Constant ratio</p>
        <div class="bg-white/70 dark:bg-zinc-900/50 rounded-lg p-3 font-mono text-center text-lg">3, 6, 12, 24, 48...</div>
        <p class="text-xs text-center text-zinc-500">an = a1 * r^(n-1)</p>
      </div>
      <div class="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 rounded-2xl p-6 space-y-3">
        <h2 class="text-lg font-bold text-amber-700 dark:text-amber-400">Fibonacci</h2>
        <p class="text-sm text-zinc-600 dark:text-zinc-400">Sum of previous two</p>
        <div class="bg-white/70 dark:bg-zinc-900/50 rounded-lg p-3 font-mono text-center text-lg">1, 1, 2, 3, 5, 8, 13...</div>
        <p class="text-xs text-center text-zinc-500">Fn = Fn-1 + Fn-2</p>
      </div>
    </div>
    <div class="bg-zinc-50 dark:bg-zinc-800 rounded-2xl p-6">
      <h3 class="font-semibold mb-3">Patterns in Nature</h3>
      <p class="text-sm text-zinc-600 dark:text-zinc-400">The Fibonacci sequence appears in sunflower spirals, nautilus shells, pinecone scales, and branching trees.</p>
    </div>
  </div>
</div>`),
        },
        {
          id: "sec_004",
          title: "Common Logical Fallacies",
          totalPages: 1,
          content: JSON.stringify([
            { title: "Common Logical Fallacies", type: "table", tableData: { headers: ["Fallacy", "Description", "Example"], rows: [
              ["Ad Hominem", "Attacking the person, not the argument", "You cannot trust his math"],
              ["Straw Man", "Misrepresenting the argument", "Oversimplifying a position"],
              ["Circular Reasoning", "Begging the question", "X is true because X is true"],
            ]} },
          ]),
          htmlBody: wrapHtml("Common Logical Fallacies", `
<div class="min-h-screen flex items-center justify-center p-8">
  <div class="max-w-5xl w-full space-y-6">
    <h1 class="text-3xl font-bold">Common Logical Fallacies</h1>
    <p class="text-zinc-500 dark:text-zinc-400">Recognizing these traps strengthens your reasoning.</p>
    <div class="rounded-2xl border border-zinc-200 dark:border-zinc-700 overflow-hidden">
      <table class="w-full text-sm">
        <thead><tr class="bg-zinc-100 dark:bg-zinc-800">
          <th class="text-left p-4 font-semibold">Fallacy</th>
          <th class="text-left p-4 font-semibold">Description</th>
          <th class="text-left p-4 font-semibold">Example</th>
        </tr></thead>
        <tbody class="divide-y divide-zinc-100 dark:divide-zinc-800">
          <tr class="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
            <td class="p-4 font-medium text-rose-600 dark:text-rose-400">Ad Hominem</td>
            <td class="p-4 text-zinc-600 dark:text-zinc-400">Attacking the person instead of their argument</td>
            <td class="p-4 text-zinc-500 italic">"You can't trust his math, he's a musician"</td>
          </tr>
          <tr class="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
            <td class="p-4 font-medium text-rose-600 dark:text-rose-400">Straw Man</td>
            <td class="p-4 text-zinc-600 dark:text-zinc-400">Misrepresenting an argument to make it easier to attack</td>
            <td class="p-4 text-zinc-500 italic">Oversimplifying a nuanced position</td>
          </tr>
          <tr class="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
            <td class="p-4 font-medium text-rose-600 dark:text-rose-400">Circular Reasoning</td>
            <td class="p-4 text-zinc-600 dark:text-zinc-400">The conclusion is assumed in the premise</td>
            <td class="p-4 text-zinc-500 italic">"X is true because X is true"</td>
          </tr>
          <tr class="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
            <td class="p-4 font-medium text-rose-600 dark:text-rose-400">False Dilemma</td>
            <td class="p-4 text-zinc-600 dark:text-zinc-400">Presenting only two options when more exist</td>
            <td class="p-4 text-zinc-500 italic">"You're either with us or against us"</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</div>`),
        },
        {
          id: "sec_005",
          title: "Problem Solving Strategies",
          totalPages: 1,
          content: JSON.stringify([
            { title: "Problem Solving Strategies", type: "list", items: [
              { text: "1. Understand the Problem - Identify givens and goals" },
              { text: "2. Devise a Plan - Choose a strategy" },
              { text: "3. Carry out the Plan - Execute step by step" },
              { text: "4. Look Back - Verify and consider alternatives" },
            ]},
            { title: "Quick Check", type: "quiz", items: [{ text: "Which strategy involves reversing the steps from the desired outcome?" }] },
          ]),
          htmlBody: wrapHtml("Problem Solving Strategies", `
<div class="min-h-screen flex items-center justify-center p-8">
  <div class="max-w-5xl w-full space-y-8">
    <div class="flex items-baseline justify-between">
      <h1 class="text-3xl font-bold">Problem Solving Strategies</h1>
      <span class="text-sm text-zinc-400">Polya's Four-Step Method</span>
    </div>
    <div class="grid grid-cols-4 gap-4">
      <div class="text-center space-y-3">
        <div class="mx-auto w-14 h-14 rounded-2xl bg-teal-100 dark:bg-teal-900/50 flex items-center justify-center text-teal-700 dark:text-teal-300 font-bold text-xl">1</div>
        <h3 class="font-semibold">Understand</h3>
        <p class="text-xs text-zinc-500 dark:text-zinc-400">Identify givens and goals</p>
      </div>
      <div class="text-center space-y-3">
        <div class="mx-auto w-14 h-14 rounded-2xl bg-cyan-100 dark:bg-cyan-900/50 flex items-center justify-center text-cyan-700 dark:text-cyan-300 font-bold text-xl">2</div>
        <h3 class="font-semibold">Devise</h3>
        <p class="text-xs text-zinc-500 dark:text-zinc-400">Choose a strategy and plan</p>
      </div>
      <div class="text-center space-y-3">
        <div class="mx-auto w-14 h-14 rounded-2xl bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center text-emerald-700 dark:text-emerald-300 font-bold text-xl">3</div>
        <h3 class="font-semibold">Execute</h3>
        <p class="text-xs text-zinc-500 dark:text-zinc-400">Carry out your plan step by step</p>
      </div>
      <div class="text-center space-y-3">
        <div class="mx-auto w-14 h-14 rounded-2xl bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center text-amber-700 dark:text-amber-300 font-bold text-xl">4</div>
        <h3 class="font-semibold">Verify</h3>
        <p class="text-xs text-zinc-500 dark:text-zinc-400">Check your answer and reflect</p>
      </div>
    </div>
    <div class="bg-zinc-50 dark:bg-zinc-800 rounded-2xl p-6 space-y-4">
      <h3 class="font-semibold">Quick Check</h3>
      <p class="text-sm">Which strategy involves reversing the steps from the desired outcome back to the starting point?</p>
      <div class="grid grid-cols-2 gap-3">
        <button class="text-left px-4 py-3 rounded-xl border-2 border-zinc-200 dark:border-zinc-700 hover:border-teal-400 dark:hover:border-teal-600 text-sm transition">A. Draw a Diagram</button>
        <button class="text-left px-4 py-3 rounded-xl border-2 border-zinc-200 dark:border-zinc-700 hover:border-teal-400 dark:hover:border-teal-600 text-sm transition">B. Work Backwards</button>
        <button class="text-left px-4 py-3 rounded-xl border-2 border-zinc-200 dark:border-zinc-700 hover:border-teal-400 dark:hover:border-teal-600 text-sm transition">C. Look for a Pattern</button>
        <button class="text-left px-4 py-3 rounded-xl border-2 border-zinc-200 dark:border-zinc-700 hover:border-teal-400 dark:hover:border-teal-600 text-sm transition">D. Solve a Simpler Problem</button>
      </div>
    </div>
  </div>
</div>`),
        },
      ],
    },
    // ========================================
    // Course 2: Data Science Fundamentals
    // ========================================
    {
      id: "course_002",
      title: "Data Science Fundamentals",
      description: "Learn the fundamentals of data science including data collection, cleaning, statistical analysis, and visualization. Build a strong foundation for working with data.",
      categoryId: "cat_004",
      coverImage: "https://placehold.co/800x450/7c3aed/white?text=Data+Science+Fundamentals",
      language: "english",
      studentCount: 189,
      rating: 4.6,
      sections: [
        {
          id: "sec_006",
          title: "What is Data Science?",
          totalPages: 1,
          content: JSON.stringify([
            { title: "What is Data Science?", type: "title", subtitle: "Understanding the power of data-driven decisions" },
            { title: "The Data Science Workflow", type: "content", items: [
              { heading: "Collect", text: "Gather data from databases, APIs, and surveys." },
              { heading: "Clean", text: "Remove errors, duplicates, and inconsistencies." },
              { heading: "Analyze", text: "Apply statistical methods and algorithms." },
              { heading: "Visualize", text: "Create charts and dashboards for insights." },
            ]},
          ]),
          htmlBody: wrapHtml("What is Data Science?", `
<div class="min-h-screen flex items-center justify-center p-8">
  <div class="max-w-4xl w-full text-center space-y-10">
    <div class="inline-block px-4 py-1.5 rounded-full bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 text-sm font-medium tracking-wide uppercase">Data Science</div>
    <h1 class="text-5xl font-extrabold leading-tight">
      <span class="bg-gradient-to-r from-violet-600 to-purple-500 bg-clip-text text-transparent">What is</span><br/>
      <span class="text-zinc-900 dark:text-zinc-100">Data Science?</span>
    </h1>
    <p class="text-xl text-zinc-500 dark:text-zinc-400 max-w-2xl mx-auto">The interdisciplinary field that uses scientific methods to extract knowledge and insights from data</p>
    <div class="grid grid-cols-4 gap-4 pt-4">
      <div class="bg-violet-50 dark:bg-violet-950/30 rounded-2xl p-5 space-y-2">
        <div class="text-2xl font-bold text-violet-600">01</div>
        <h3 class="font-semibold text-sm">Collect</h3>
        <p class="text-xs text-zinc-500">Gather from databases, APIs, surveys</p>
      </div>
      <div class="bg-purple-50 dark:bg-purple-950/30 rounded-2xl p-5 space-y-2">
        <div class="text-2xl font-bold text-purple-600">02</div>
        <h3 class="font-semibold text-sm">Clean</h3>
        <p class="text-xs text-zinc-500">Remove errors and inconsistencies</p>
      </div>
      <div class="bg-fuchsia-50 dark:bg-fuchsia-950/30 rounded-2xl p-5 space-y-2">
        <div class="text-2xl font-bold text-fuchsia-600">03</div>
        <h3 class="font-semibold text-sm">Analyze</h3>
        <p class="text-xs text-zinc-500">Apply statistical methods</p>
      </div>
      <div class="bg-pink-50 dark:bg-pink-950/30 rounded-2xl p-5 space-y-2">
        <div class="text-2xl font-bold text-pink-600">04</div>
        <h3 class="font-semibold text-sm">Visualize</h3>
        <p class="text-xs text-zinc-500">Create charts and dashboards</p>
      </div>
    </div>
  </div>
</div>`),
        },
        {
          id: "sec_007",
          title: "Data Collection and Cleaning",
          totalPages: 1,
          content: JSON.stringify([
            { title: "Data Collection and Cleaning", type: "content", items: [
              { heading: "Collection Methods", text: "Databases, APIs, web scraping, surveys, and sensor data." },
              { heading: "Common Issues", text: "Missing values, duplicates, outliers, inconsistent formats." },
              { heading: "Cleaning Steps", text: "Validate, impute, transform, and normalize your data." },
            ]},
          ]),
          htmlBody: wrapHtml("Data Collection and Cleaning", `
<div class="min-h-screen flex items-center justify-center p-8">
  <div class="max-w-5xl w-full space-y-8">
    <h1 class="text-3xl font-bold">Data Collection &amp; Cleaning</h1>
    <div class="grid grid-cols-2 gap-8">
      <div class="space-y-4">
        <h2 class="text-xl font-bold text-violet-700 dark:text-violet-400">Collection Methods</h2>
        <div class="space-y-2">
          <div class="flex items-center gap-3 p-3 bg-zinc-50 dark:bg-zinc-800 rounded-xl"><span class="w-8 h-8 rounded-lg bg-violet-100 dark:bg-violet-900/50 flex items-center justify-center text-violet-600 text-sm font-bold">DB</span><span class="text-sm">Databases &amp; Data Warehouses</span></div>
          <div class="flex items-center gap-3 p-3 bg-zinc-50 dark:bg-zinc-800 rounded-xl"><span class="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-900/50 flex items-center justify-center text-purple-600 text-sm font-bold">API</span><span class="text-sm">REST APIs &amp; Web Services</span></div>
          <div class="flex items-center gap-3 p-3 bg-zinc-50 dark:bg-zinc-800 rounded-xl"><span class="w-8 h-8 rounded-lg bg-fuchsia-100 dark:bg-fuchsia-900/50 flex items-center justify-center text-fuchsia-600 text-sm font-bold">W</span><span class="text-sm">Web Scraping</span></div>
          <div class="flex items-center gap-3 p-3 bg-zinc-50 dark:bg-zinc-800 rounded-xl"><span class="w-8 h-8 rounded-lg bg-pink-100 dark:bg-pink-900/50 flex items-center justify-center text-pink-600 text-sm font-bold">S</span><span class="text-sm">Surveys &amp; Questionnaires</span></div>
        </div>
      </div>
      <div class="space-y-4">
        <h2 class="text-xl font-bold text-rose-700 dark:text-rose-400">Common Data Issues</h2>
        <div class="rounded-2xl border border-zinc-200 dark:border-zinc-700 overflow-hidden">
          <table class="w-full text-sm">
            <thead><tr class="bg-zinc-100 dark:bg-zinc-800"><th class="text-left p-3 font-semibold">Issue</th><th class="text-left p-3 font-semibold">Fix</th></tr></thead>
            <tbody class="divide-y divide-zinc-100 dark:divide-zinc-800">
              <tr><td class="p-3">Missing values</td><td class="p-3 text-zinc-500">Impute or drop</td></tr>
              <tr><td class="p-3">Duplicates</td><td class="p-3 text-zinc-500">Deduplicate rows</td></tr>
              <tr><td class="p-3">Outliers</td><td class="p-3 text-zinc-500">Cap or investigate</td></tr>
              <tr><td class="p-3">Inconsistent formats</td><td class="p-3 text-zinc-500">Standardize</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</div>`),
        },
        {
          id: "sec_008",
          title: "Statistical Foundations",
          totalPages: 1,
          content: JSON.stringify([
            { title: "Statistical Foundations", type: "content", items: [
              { heading: "Mean", text: "The average of all values. Sensitive to outliers." },
              { heading: "Median", text: "The middle value. Robust to outliers." },
              { heading: "Standard Deviation", text: "Measures spread of data around the mean." },
            ]},
          ]),
          htmlBody: wrapHtml("Statistical Foundations", `
<div class="min-h-screen flex items-center justify-center p-8">
  <div class="max-w-5xl w-full space-y-8">
    <h1 class="text-3xl font-bold">Statistical Foundations</h1>
    <div class="grid grid-cols-3 gap-6">
      <div class="rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 p-6 text-white space-y-4">
        <h2 class="text-xl font-bold">Mean</h2>
        <p class="text-white/80 text-sm">The arithmetic average of all values in a dataset.</p>
        <div class="bg-white/20 rounded-xl p-4 text-center">
          <p class="text-3xl font-bold font-mono">x&#772; = &#8721;x / n</p>
        </div>
        <p class="text-xs text-white/70">Sensitive to outliers. Use with normally distributed data.</p>
      </div>
      <div class="rounded-2xl bg-gradient-to-br from-fuchsia-500 to-pink-600 p-6 text-white space-y-4">
        <h2 class="text-xl font-bold">Median</h2>
        <p class="text-white/80 text-sm">The middle value when data is sorted in order.</p>
        <div class="bg-white/20 rounded-xl p-4 text-center">
          <p class="text-3xl font-bold font-mono">P50</p>
        </div>
        <p class="text-xs text-white/70">Robust to outliers. Better for skewed distributions.</p>
      </div>
      <div class="rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 p-6 text-white space-y-4">
        <h2 class="text-xl font-bold">Std Deviation</h2>
        <p class="text-white/80 text-sm">Measures how spread out values are from the mean.</p>
        <div class="bg-white/20 rounded-xl p-4 text-center">
          <p class="text-3xl font-bold font-mono">&#963;</p>
        </div>
        <p class="text-xs text-white/70">Low = clustered, High = spread out.</p>
      </div>
    </div>
  </div>
</div>`),
        },
        {
          id: "sec_009",
          title: "Data Visualization",
          totalPages: 1,
          content: JSON.stringify([
            { title: "Data Visualization", type: "table", tableData: { headers: ["Chart Type", "Best For", "Example"], rows: [
              ["Bar Chart", "Comparing categories", "Sales by region"],
              ["Line Chart", "Trends over time", "Monthly revenue"],
              ["Pie Chart", "Proportions", "Market share"],
              ["Scatter Plot", "Relationships", "Correlation analysis"],
            ]} },
          ]),
          htmlBody: wrapHtml("Data Visualization", `
<div class="min-h-screen flex items-center justify-center p-8">
  <div class="max-w-5xl w-full space-y-8">
    <h1 class="text-3xl font-bold">Data Visualization</h1>
    <p class="text-zinc-500 dark:text-zinc-400">Choose the right chart for your data to tell a clear story.</p>
    <div class="grid grid-cols-2 gap-6">
      <div class="flex gap-4 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-700 hover:shadow-md transition">
        <div class="w-16 h-16 rounded-xl bg-violet-100 dark:bg-violet-900/50 flex items-center justify-center shrink-0">
          <div class="space-y-1 flex flex-col items-end"><div class="w-10 h-2 bg-violet-500 rounded"></div><div class="w-7 h-2 bg-violet-400 rounded"></div><div class="w-12 h-2 bg-violet-500 rounded"></div><div class="w-5 h-2 bg-violet-300 rounded"></div></div>
        </div>
        <div><h3 class="font-bold">Bar Chart</h3><p class="text-sm text-zinc-500 mt-1">Best for comparing categories</p><p class="text-xs text-zinc-400 mt-1">Example: Sales by region</p></div>
      </div>
      <div class="flex gap-4 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-700 hover:shadow-md transition">
        <div class="w-16 h-16 rounded-xl bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center shrink-0">
          <svg class="w-10 h-10" viewBox="0 0 40 40" fill="none"><polyline points="4,30 14,15 24,22 36,8" stroke="#059669" stroke-width="2.5" fill="none" stroke-linecap="round"/></svg>
        </div>
        <div><h3 class="font-bold">Line Chart</h3><p class="text-sm text-zinc-500 mt-1">Best for showing trends over time</p><p class="text-xs text-zinc-400 mt-1">Example: Monthly revenue</p></div>
      </div>
      <div class="flex gap-4 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-700 hover:shadow-md transition">
        <div class="w-16 h-16 rounded-xl bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center shrink-0">
          <div class="w-12 h-12 rounded-full border-4 border-amber-400 border-t-amber-600"></div>
        </div>
        <div><h3 class="font-bold">Pie Chart</h3><p class="text-sm text-zinc-500 mt-1">Best for showing proportions</p><p class="text-xs text-zinc-400 mt-1">Example: Market share</p></div>
      </div>
      <div class="flex gap-4 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-700 hover:shadow-md transition">
        <div class="w-16 h-16 rounded-xl bg-rose-100 dark:bg-rose-900/50 flex items-center justify-center shrink-0">
          <div class="w-3 h-3 rounded-full bg-rose-400 absolute" style="position:relative; top:-4px; left:8px;"></div><div class="w-3 h-3 rounded-full bg-rose-300" style="position:relative; top:-6px; left:22px;"></div><div class="w-3 h-3 rounded-full bg-rose-400" style="position:relative; top:-12px; left:14px;"></div>
        </div>
        <div><h3 class="font-bold">Scatter Plot</h3><p class="text-sm text-zinc-500 mt-1">Best for showing relationships</p><p class="text-xs text-zinc-400 mt-1">Example: Correlation analysis</p></div>
      </div>
    </div>
  </div>
</div>`),
        },
        {
          id: "sec_010",
          title: "Introduction to Machine Learning",
          totalPages: 1,
          content: JSON.stringify([
            { title: "Introduction to Machine Learning", type: "content", items: [
              { heading: "Supervised Learning", text: "Learns from labeled data to make predictions. Examples: classification, regression." },
              { heading: "Unsupervised Learning", text: "Finds patterns in unlabeled data. Examples: clustering, dimensionality reduction." },
              { heading: "Reinforcement Learning", text: "Learns through trial and error with rewards. Examples: game AI, robotics." },
            ]},
            { title: "Quick Check", type: "quiz", items: [{ text: "Predicting house prices from features like square footage is an example of which type of ML?" }] },
          ]),
          htmlBody: wrapHtml("Introduction to Machine Learning", `
<div class="min-h-screen flex items-center justify-center p-8">
  <div class="max-w-5xl w-full space-y-8">
    <h1 class="text-3xl font-bold">Introduction to Machine Learning</h1>
    <div class="grid grid-cols-3 gap-6">
      <div class="rounded-2xl border-2 border-violet-200 dark:border-violet-800 p-6 space-y-3">
        <div class="w-10 h-10 rounded-xl bg-violet-100 dark:bg-violet-900/50 flex items-center justify-center text-violet-600 font-bold text-sm">SL</div>
        <h2 class="font-bold text-lg">Supervised</h2>
        <p class="text-sm text-zinc-600 dark:text-zinc-400">Learns from labeled data to make predictions</p>
        <div class="text-xs text-zinc-400 space-y-1 mt-2">
          <p>- Classification</p>
          <p>- Regression</p>
        </div>
      </div>
      <div class="rounded-2xl border-2 border-emerald-200 dark:border-emerald-800 p-6 space-y-3">
        <div class="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center text-emerald-600 font-bold text-sm">UL</div>
        <h2 class="font-bold text-lg">Unsupervised</h2>
        <p class="text-sm text-zinc-600 dark:text-zinc-400">Finds hidden patterns in unlabeled data</p>
        <div class="text-xs text-zinc-400 space-y-1 mt-2">
          <p>- Clustering</p>
          <p>- Dimensionality Reduction</p>
        </div>
      </div>
      <div class="rounded-2xl border-2 border-amber-200 dark:border-amber-800 p-6 space-y-3">
        <div class="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center text-amber-600 font-bold text-sm">RL</div>
        <h2 class="font-bold text-lg">Reinforcement</h2>
        <p class="text-sm text-zinc-600 dark:text-zinc-400">Learns through trial and error with rewards</p>
        <div class="text-xs text-zinc-400 space-y-1 mt-2">
          <p>- Game AI</p>
          <p>- Robotics</p>
        </div>
      </div>
    </div>
    <div class="bg-zinc-50 dark:bg-zinc-800 rounded-2xl p-6 space-y-4">
      <h3 class="font-semibold">Quick Check</h3>
      <p class="text-sm">Predicting house prices from features like square footage is an example of which type of ML?</p>
      <div class="grid grid-cols-2 gap-3">
        <button class="text-left px-4 py-3 rounded-xl border-2 border-zinc-200 dark:border-zinc-700 hover:border-violet-400 text-sm transition">A. Unsupervised Learning</button>
        <button class="text-left px-4 py-3 rounded-xl border-2 border-zinc-200 dark:border-zinc-700 hover:border-violet-400 text-sm transition">B. Supervised Learning (Regression)</button>
        <button class="text-left px-4 py-3 rounded-xl border-2 border-zinc-200 dark:border-zinc-700 hover:border-violet-400 text-sm transition">C. Reinforcement Learning</button>
        <button class="text-left px-4 py-3 rounded-xl border-2 border-zinc-200 dark:border-zinc-700 hover:border-violet-400 text-sm transition">D. None of the above</button>
      </div>
    </div>
  </div>
</div>`),
        },
      ],
    },
    // ========================================
    // Course 3: Python Programming
    // ========================================
    {
      id: "course_003",
      title: "Python Programming",
      description: "Learn Python from the ground up. Master syntax, data structures, functions, OOP, and file handling through practical examples and exercises.",
      categoryId: "cat_004",
      coverImage: "https://placehold.co/800x450/059669/white?text=Python+Programming",
      language: "english",
      studentCount: 256,
      rating: 4.7,
      sections: [
        {
          id: "sec_011",
          title: "Python Basics and Syntax",
          totalPages: 1,
          content: JSON.stringify([
            { title: "Python Basics and Syntax", type: "content", items: [
              { heading: "Variables", text: "Python is dynamically typed. Use meaningful variable names." },
              { heading: "Control Flow", text: "if/elif/else for branching, for/while for loops." },
              { heading: "Data Types", text: "int, float, str, bool, list, dict, tuple, set." },
            ]},
          ]),
          htmlBody: wrapHtml("Python Basics and Syntax", `
<div class="min-h-screen flex items-center justify-center p-8">
  <div class="max-w-5xl w-full space-y-8">
    <h1 class="text-3xl font-bold">Python Basics &amp; Syntax</h1>
    <div class="grid grid-cols-2 gap-8">
      <div class="space-y-4">
        <h2 class="text-xl font-bold text-emerald-700 dark:text-emerald-400">Variables &amp; Types</h2>
        <div class="bg-zinc-900 rounded-2xl p-5 font-mono text-sm leading-relaxed">
          <p class="text-zinc-500"># Python is dynamically typed</p>
          <p><span class="text-emerald-400">name</span> = <span class="text-amber-300">"Alice"</span></p>
          <p><span class="text-emerald-400">age</span> = <span class="text-violet-300">25</span></p>
          <p><span class="text-emerald-400">scores</span> = [<span class="text-violet-300">90</span>, <span class="text-violet-300">85</span>, <span class="text-violet-300">92</span>]</p>
          <p><span class="text-emerald-400">active</span> = <span class="text-violet-300">True</span></p>
        </div>
      </div>
      <div class="space-y-4">
        <h2 class="text-xl font-bold text-emerald-700 dark:text-emerald-400">Control Flow</h2>
        <div class="bg-zinc-900 rounded-2xl p-5 font-mono text-sm leading-relaxed">
          <p class="text-zinc-500"># If/elif/else</p>
          <p><span class="text-rose-400">if</span> score >= <span class="text-violet-300">90</span>:</p>
          <p>    <span class="text-emerald-400">print</span>(<span class="text-amber-300">"Grade: A"</span>)</p>
          <p><span class="text-rose-400">elif</span> score >= <span class="text-violet-300">80</span>:</p>
          <p>    <span class="text-emerald-400">print</span>(<span class="text-amber-300">"Grade: B"</span>)</p>
          <p class="text-zinc-500 mt-2"># For loop</p>
          <p><span class="text-rose-400">for</span> s <span class="text-rose-400">in</span> scores:</p>
          <p>    <span class="text-emerald-400">print</span>(s)</p>
        </div>
      </div>
    </div>
  </div>
</div>`),
        },
        {
          id: "sec_012",
          title: "Data Structures",
          totalPages: 1,
          content: JSON.stringify([
            { title: "Data Structures", type: "table", tableData: { headers: ["Structure", "Ordered", "Mutable", "Use Case"], rows: [
              ["List", "Yes", "Yes", "Ordered collection of items"],
              ["Tuple", "Yes", "No", "Fixed collection, immutable"],
              ["Dict", "No (3.7+)", "Yes", "Key-value pairs"],
              ["Set", "No", "Yes", "Unique elements, no duplicates"],
            ]} },
          ]),
          htmlBody: wrapHtml("Data Structures", `
<div class="min-h-screen flex items-center justify-center p-8">
  <div class="max-w-5xl w-full space-y-6">
    <h1 class="text-3xl font-bold">Python Data Structures</h1>
    <div class="rounded-2xl border border-zinc-200 dark:border-zinc-700 overflow-hidden">
      <table class="w-full text-sm">
        <thead><tr class="bg-zinc-100 dark:bg-zinc-800">
          <th class="text-left p-4 font-semibold">Structure</th>
          <th class="text-left p-4 font-semibold">Ordered</th>
          <th class="text-left p-4 font-semibold">Mutable</th>
          <th class="text-left p-4 font-semibold">Use Case</th>
        </tr></thead>
        <tbody class="divide-y divide-zinc-100 dark:divide-zinc-800">
          <tr class="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
            <td class="p-4 font-mono font-medium text-emerald-600">list</td>
            <td class="p-4">Yes</td>
            <td class="p-4">Yes</td>
            <td class="p-4 text-zinc-500">Ordered collection of items</td>
          </tr>
          <tr class="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
            <td class="p-4 font-mono font-medium text-emerald-600">tuple</td>
            <td class="p-4">Yes</td>
            <td class="p-4">No</td>
            <td class="p-4 text-zinc-500">Fixed collection, immutable</td>
          </tr>
          <tr class="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
            <td class="p-4 font-mono font-medium text-emerald-600">dict</td>
            <td class="p-4">Yes (3.7+)</td>
            <td class="p-4">Yes</td>
            <td class="p-4 text-zinc-500">Key-value pairs</td>
          </tr>
          <tr class="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
            <td class="p-4 font-mono font-medium text-emerald-600">set</td>
            <td class="p-4">No</td>
            <td class="p-4">Yes</td>
            <td class="p-4 text-zinc-500">Unique elements, no duplicates</td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="bg-zinc-900 rounded-2xl p-5 font-mono text-sm leading-relaxed">
      <p><span class="text-emerald-400">fruits</span> = [<span class="text-amber-300">"apple"</span>, <span class="text-amber-300">"banana"</span>, <span class="text-amber-300">"cherry"</span>]</p>
      <p><span class="text-emerald-400">point</span> = (<span class="text-violet-300">10</span>, <span class="text-violet-300">20</span>)</p>
      <p><span class="text-emerald-400">person</span> = {<span class="text-amber-300">"name"</span>: <span class="text-amber-300">"Alice"</span>, <span class="text-amber-300">"age"</span>: <span class="text-violet-300">25</span>}</p>
      <p><span class="text-emerald-400">unique</span> = {<span class="text-violet-300">1</span>, <span class="text-violet-300">2</span>, <span class="text-violet-300">3</span>, <span class="text-violet-300">2</span>}  <span class="text-zinc-500"># {1, 2, 3}</span></p>
    </div>
  </div>
</div>`),
        },
        {
          id: "sec_013",
          title: "Functions and Modules",
          totalPages: 1,
          content: JSON.stringify([
            { title: "Functions and Modules", type: "content", items: [
              { heading: "Defining Functions", text: "Use def keyword. Support default args, *args, **kwargs." },
              { heading: "Lambda Functions", text: "Anonymous one-line functions for simple operations." },
              { heading: "Modules", text: "Import code from other files. Use pip to install packages." },
            ]},
          ]),
          htmlBody: wrapHtml("Functions and Modules", `
<div class="min-h-screen flex items-center justify-center p-8">
  <div class="max-w-5xl w-full space-y-8">
    <h1 class="text-3xl font-bold">Functions &amp; Modules</h1>
    <div class="grid grid-cols-2 gap-8">
      <div class="space-y-4">
        <h2 class="text-xl font-bold text-emerald-700 dark:text-emerald-400">Defining Functions</h2>
        <div class="bg-zinc-900 rounded-2xl p-5 font-mono text-sm leading-relaxed">
          <p><span class="text-rose-400">def</span> <span class="text-emerald-400">greet</span>(<span class="text-violet-300">name</span>, <span class="text-violet-300">greeting</span>=<span class="text-amber-300">"Hello"</span>):</p>
          <p>    <span class="text-rose-400">return</span> <span class="text-emerald-400">f"{greeting}, {name}!"</span></p>
          <p class="mt-2 text-zinc-500"># Call the function</p>
          <p><span class="text-emerald-400">print</span>(<span class="text-emerald-400">greet</span>(<span class="text-amber-300">"Alice"</span>))</p>
          <p><span class="text-emerald-400">print</span>(<span class="text-emerald-400">greet</span>(<span class="text-amber-300">"Bob"</span>, <span class="text-amber-300">"Hi"</span>))</p>
        </div>
      </div>
      <div class="space-y-4">
        <h2 class="text-xl font-bold text-emerald-700 dark:text-emerald-400">Lambdas &amp; Imports</h2>
        <div class="bg-zinc-900 rounded-2xl p-5 font-mono text-sm leading-relaxed">
          <p class="text-zinc-500"># Lambda (anonymous function)</p>
          <p><span class="text-emerald-400">square</span> = <span class="text-rose-400">lambda</span> <span class="text-violet-300">x</span>: x ** <span class="text-violet-300">2</span></p>
          <p class="mt-2 text-zinc-500"># Importing modules</p>
          <p><span class="text-rose-400">import</span> math</p>
          <p><span class="text-rose-400">from</span> datetime <span class="text-rose-400">import</span> date</p>
          <p class="mt-2 text-zinc-500"># Using imported functions</p>
          <p>math.<span class="text-emerald-400">sqrt</span>(<span class="text-violet-300">144</span>)  <span class="text-zinc-500"># 12.0</span></p>
        </div>
      </div>
    </div>
  </div>
</div>`),
        },
        {
          id: "sec_014",
          title: "Object-Oriented Programming",
          totalPages: 1,
          content: JSON.stringify([
            { title: "Object-Oriented Programming", type: "content", items: [
              { heading: "Classes and Objects", text: "Classes are blueprints. Objects are instances of classes." },
              { heading: "Inheritance", text: "Create specialized classes that extend base classes." },
              { heading: "Encapsulation", text: "Bundle data and methods, control access with public/private." },
            ]},
          ]),
          htmlBody: wrapHtml("Object-Oriented Programming", `
<div class="min-h-screen flex items-center justify-center p-8">
  <div class="max-w-5xl w-full space-y-8">
    <h1 class="text-3xl font-bold">Object-Oriented Programming</h1>
    <div class="grid grid-cols-3 gap-6">
      <div class="rounded-2xl border-2 border-emerald-200 dark:border-emerald-800 p-6 space-y-3">
        <div class="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center text-emerald-600 font-bold text-sm">C</div>
        <h2 class="font-bold text-lg">Classes</h2>
        <p class="text-sm text-zinc-600 dark:text-zinc-400">Blueprints for creating objects with attributes and methods.</p>
      </div>
      <div class="rounded-2xl border-2 border-teal-200 dark:border-teal-800 p-6 space-y-3">
        <div class="w-10 h-10 rounded-xl bg-teal-100 dark:bg-teal-900/50 flex items-center justify-center text-teal-600 font-bold text-sm">I</div>
        <h2 class="font-bold text-lg">Inheritance</h2>
        <p class="text-sm text-zinc-600 dark:text-zinc-400">Create specialized classes that extend and override base classes.</p>
      </div>
      <div class="rounded-2xl border-2 border-cyan-200 dark:border-cyan-800 p-6 space-y-3">
        <div class="w-10 h-10 rounded-xl bg-cyan-100 dark:bg-cyan-900/50 flex items-center justify-center text-cyan-600 font-bold text-sm">E</div>
        <h2 class="font-bold text-lg">Encapsulation</h2>
        <p class="text-sm text-zinc-600 dark:text-zinc-400">Bundle data and methods, control access with public/private.</p>
      </div>
    </div>
    <div class="bg-zinc-900 rounded-2xl p-5 font-mono text-sm leading-relaxed">
      <p><span class="text-rose-400">class</span> <span class="text-emerald-400">Dog</span>:</p>
      <p>    <span class="text-rose-400">def</span> <span class="text-emerald-400">__init__</span>(<span class="text-violet-300">self</span>, <span class="text-violet-300">name</span>, <span class="text-violet-300">breed</span>):</p>
      <p>        <span class="text-violet-300">self</span>.name = <span class="text-violet-300">name</span></p>
      <p>        <span class="text-violet-300">self</span>.breed = <span class="text-violet-300">breed</span></p>
      <p class="mt-1">    <span class="text-rose-400">def</span> <span class="text-emerald-400">bark</span>(<span class="text-violet-300">self</span>):</p>
      <p>        <span class="text-rose-400">return</span> <span class="text-emerald-400">f"{self.name} says Woof!"</span></p>
      <p class="mt-2 text-zinc-500"># Create an instance</p>
      <p><span class="text-violet-300">rex</span> = <span class="text-emerald-400">Dog</span>(<span class="text-amber-300">"Rex"</span>, <span class="text-amber-300">"Shepherd"</span>)</p>
      <p><span class="text-emerald-400">print</span>(rex.<span class="text-emerald-400">bark</span>())  <span class="text-zinc-500"># Rex says Woof!</span></p>
    </div>
  </div>
</div>`),
        },
        {
          id: "sec_015",
          title: "File I/O and Error Handling",
          totalPages: 1,
          content: JSON.stringify([
            { title: "File I/O and Error Handling", type: "content", items: [
              { heading: "Reading Files", text: "Use open() with context managers (with statement)." },
              { heading: "Writing Files", text: "Use 'w' mode to write, 'a' mode to append." },
              { heading: "Try/Except", text: "Handle errors gracefully without crashing." },
            ]},
            { title: "Quick Check", type: "quiz", items: [{ text: "Which mode should you use to append to an existing file?" }] },
          ]),
          htmlBody: wrapHtml("File I/O and Error Handling", `
<div class="min-h-screen flex items-center justify-center p-8">
  <div class="max-w-5xl w-full space-y-8">
    <h1 class="text-3xl font-bold">File I/O &amp; Error Handling</h1>
    <div class="bg-zinc-900 rounded-2xl p-5 font-mono text-sm leading-relaxed">
      <p class="text-zinc-500"># Reading a file with context manager</p>
      <p><span class="text-rose-400">with</span> <span class="text-emerald-400">open</span>(<span class="text-amber-300">"data.txt"</span>, <span class="text-amber-300">"r"</span>) <span class="text-rose-400">as</span> <span class="text-violet-300">f</span>:</p>
      <p>    <span class="text-violet-300">content</span> = f.<span class="text-emerald-400">read</span>()</p>
      <p class="mt-3 text-zinc-500"># Writing to a file</p>
      <p><span class="text-rose-400">with</span> <span class="text-emerald-400">open</span>(<span class="text-amber-300">"output.txt"</span>, <span class="text-amber-300">"w"</span>) <span class="text-rose-400">as</span> <span class="text-violet-300">f</span>:</p>
      <p>    f.<span class="text-emerald-400">write</span>(<span class="text-amber-300">"Hello, World!"</span>)</p>
      <p class="mt-3 text-zinc-500"># Error handling with try/except</p>
      <p><span class="text-rose-400">try</span>:</p>
      <p>    result = <span class="text-violet-300">10</span> / <span class="text-violet-300">0</span></p>
      <p><span class="text-rose-400">except</span> <span class="text-emerald-400">ZeroDivisionError</span>:</p>
      <p>    <span class="text-emerald-400">print</span>(<span class="text-amber-300">"Cannot divide by zero"</span>)</p>
      <p><span class="text-rose-400">finally</span>:</p>
      <p>    <span class="text-emerald-400">print</span>(<span class="text-amber-300">"Cleanup complete"</span>)</p>
    </div>
    <div class="bg-zinc-50 dark:bg-zinc-800 rounded-2xl p-6 space-y-4">
      <h3 class="font-semibold">Quick Check</h3>
      <p class="text-sm">Which mode should you use to append to an existing file?</p>
      <div class="grid grid-cols-2 gap-3">
        <button class="text-left px-4 py-3 rounded-xl border-2 border-zinc-200 dark:border-zinc-700 hover:border-emerald-400 text-sm transition">A. "r" (read)</button>
        <button class="text-left px-4 py-3 rounded-xl border-2 border-zinc-200 dark:border-zinc-700 hover:border-emerald-400 text-sm transition">B. "a" (append)</button>
        <button class="text-left px-4 py-3 rounded-xl border-2 border-zinc-200 dark:border-zinc-700 hover:border-emerald-400 text-sm transition">C. "w" (write)</button>
        <button class="text-left px-4 py-3 rounded-xl border-2 border-zinc-200 dark:border-zinc-700 hover:border-emerald-400 text-sm transition">D. "x" (exclusive create)</button>
      </div>
    </div>
  </div>
</div>`),
        },
      ],
    },
    // ========================================
    // Course 4: Environmental Science
    // ========================================
    {
      id: "course_004",
      title: "Environmental Science",
      description: "Explore ecosystems, climate science, biodiversity, renewable energy, and environmental policy. Understand our planet and how to protect it.",
      categoryId: "cat_002",
      coverImage: "https://placehold.co/800x450/d97706/white?text=Environmental+Science",
      language: "english",
      studentCount: 134,
      rating: 4.4,
      sections: [
        {
          id: "sec_016",
          title: "Introduction to Ecosystems",
          totalPages: 1,
          content: JSON.stringify([
            { title: "Introduction to Ecosystems", type: "title", subtitle: "Understanding the web of life" },
            { title: "Key Concepts", type: "content", items: [
              { heading: "Ecosystem", text: "A community of living organisms interacting with their physical environment." },
              { heading: "Food Chain", text: "The flow of energy from producers to consumers to decomposers." },
              { heading: "Biodiversity", text: "The variety of life at genetic, species, and ecosystem levels." },
            ]},
          ]),
          htmlBody: wrapHtml("Introduction to Ecosystems", `
<div class="min-h-screen flex items-center justify-center p-8">
  <div class="max-w-4xl w-full text-center space-y-10">
    <div class="inline-block px-4 py-1.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 text-sm font-medium tracking-wide uppercase">Environmental Science</div>
    <h1 class="text-5xl font-extrabold leading-tight">
      <span class="bg-gradient-to-r from-amber-600 to-orange-500 bg-clip-text text-transparent">Introduction to</span><br/>
      <span class="text-zinc-900 dark:text-zinc-100">Ecosystems</span>
    </h1>
    <p class="text-xl text-zinc-500 dark:text-zinc-400 max-w-2xl mx-auto">Understanding the web of life and how organisms interact with their environment</p>
    <div class="grid grid-cols-3 gap-6 pt-4">
      <div class="bg-zinc-50 dark:bg-zinc-800 rounded-2xl p-6 space-y-3">
        <div class="w-12 h-12 mx-auto rounded-xl bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center text-amber-600 text-xl font-bold">E</div>
        <h3 class="font-semibold text-lg">Ecosystem</h3>
        <p class="text-sm text-zinc-500">Living organisms + physical environment</p>
      </div>
      <div class="bg-zinc-50 dark:bg-zinc-800 rounded-2xl p-6 space-y-3">
        <div class="w-12 h-12 mx-auto rounded-xl bg-orange-100 dark:bg-orange-900/50 flex items-center justify-center text-orange-600 text-xl font-bold">F</div>
        <h3 class="font-semibold text-lg">Food Chains</h3>
        <p class="text-sm text-zinc-500">Energy flow through trophic levels</p>
      </div>
      <div class="bg-zinc-50 dark:bg-zinc-800 rounded-2xl p-6 space-y-3">
        <div class="w-12 h-12 mx-auto rounded-xl bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center text-emerald-600 text-xl font-bold">B</div>
        <h3 class="font-semibold text-lg">Biodiversity</h3>
        <p class="text-sm text-zinc-500">Variety of life at all levels</p>
      </div>
    </div>
  </div>
</div>`),
        },
        {
          id: "sec_017",
          title: "Climate Change Science",
          totalPages: 1,
          content: JSON.stringify([
            { title: "Climate Change Science", type: "content", items: [
              { heading: "Greenhouse Effect", text: "Gases like CO2 and methane trap heat in the atmosphere, raising global temperatures." },
              { heading: "Evidence", text: "Rising sea levels, shrinking ice caps, increasing extreme weather events." },
              { heading: "Impact", text: "Threatens ecosystems, agriculture, water supply, and human settlements." },
            ]},
          ]),
          htmlBody: wrapHtml("Climate Change Science", `
<div class="min-h-screen flex items-center justify-center p-8">
  <div class="max-w-5xl w-full space-y-8">
    <h1 class="text-3xl font-bold">Climate Change Science</h1>
    <div class="grid grid-cols-2 gap-8">
      <div class="space-y-4">
        <h2 class="text-xl font-bold text-amber-700 dark:text-amber-400">The Greenhouse Effect</h2>
        <div class="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 rounded-2xl p-6 space-y-3">
          <div class="flex items-center gap-3 p-3 bg-white/60 dark:bg-zinc-800/60 rounded-xl">
            <span class="text-2xl">CO2</span>
            <div><p class="font-medium text-sm">Carbon Dioxide</p><p class="text-xs text-zinc-500">Fossil fuels, deforestation</p></div>
          </div>
          <div class="flex items-center gap-3 p-3 bg-white/60 dark:bg-zinc-800/60 rounded-xl">
            <span class="text-2xl">CH4</span>
            <div><p class="font-medium text-sm">Methane</p><p class="text-xs text-zinc-500">Agriculture, landfills</p></div>
          </div>
          <div class="flex items-center gap-3 p-3 bg-white/60 dark:bg-zinc-800/60 rounded-xl">
            <span class="text-2xl">N2O</span>
            <div><p class="font-medium text-sm">Nitrous Oxide</p><p class="text-xs text-zinc-500">Industrial processes</p></div>
          </div>
        </div>
      </div>
      <div class="space-y-4">
        <h2 class="text-xl font-bold text-rose-700 dark:text-rose-400">Key Evidence</h2>
        <div class="space-y-2">
          <div class="flex items-start gap-3 p-3 bg-zinc-50 dark:bg-zinc-800 rounded-xl"><span class="w-2 h-2 rounded-full bg-rose-500 mt-2 shrink-0"></span><p class="text-sm">Global temperature up 1.1 degrees C since pre-industrial era</p></div>
          <div class="flex items-start gap-3 p-3 bg-zinc-50 dark:bg-zinc-800 rounded-xl"><span class="w-2 h-2 rounded-full bg-rose-500 mt-2 shrink-0"></span><p class="text-sm">Sea levels rising 3.6mm per year</p></div>
          <div class="flex items-start gap-3 p-3 bg-zinc-50 dark:bg-zinc-800 rounded-xl"><span class="w-2 h-2 rounded-full bg-rose-500 mt-2 shrink-0"></span><p class="text-sm">Arctic ice shrinking 13% per decade</p></div>
          <div class="flex items-start gap-3 p-3 bg-zinc-50 dark:bg-zinc-800 rounded-xl"><span class="w-2 h-2 rounded-full bg-rose-500 mt-2 shrink-0"></span><p class="text-sm">Extreme weather events increasing in frequency</p></div>
        </div>
      </div>
    </div>
  </div>
</div>`),
        },
        {
          id: "sec_018",
          title: "Biodiversity and Conservation",
          totalPages: 1,
          content: JSON.stringify([
            { title: "Biodiversity and Conservation", type: "table", tableData: { headers: ["Threat Level", "Description", "Example Species"], rows: [
              ["Vulnerable", "High risk of endangerment", "Giant Panda"],
              ["Endangered", "Very high risk of extinction", "Blue Whale"],
              ["Critically Endangered", "Extremely high risk", "Amur Leopard"],
            ]} },
          ]),
          htmlBody: wrapHtml("Biodiversity and Conservation", `
<div class="min-h-screen flex items-center justify-center p-8">
  <div class="max-w-5xl w-full space-y-8">
    <h1 class="text-3xl font-bold">Biodiversity &amp; Conservation</h1>
    <div class="rounded-2xl border border-zinc-200 dark:border-zinc-700 overflow-hidden">
      <table class="w-full text-sm">
        <thead><tr class="bg-zinc-100 dark:bg-zinc-800">
          <th class="text-left p-4 font-semibold">Threat Level</th>
          <th class="text-left p-4 font-semibold">Description</th>
          <th class="text-left p-4 font-semibold">Example Species</th>
        </tr></thead>
        <tbody class="divide-y divide-zinc-100 dark:divide-zinc-800">
          <tr class="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
            <td class="p-4"><span class="inline-block px-2.5 py-1 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 text-xs font-medium">Vulnerable</span></td>
            <td class="p-4 text-zinc-600 dark:text-zinc-400">High risk of endangerment in the wild</td>
            <td class="p-4">Giant Panda</td>
          </tr>
          <tr class="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
            <td class="p-4"><span class="inline-block px-2.5 py-1 rounded-full bg-orange-100 dark:bg-orange-900/40 text-orange-700 text-xs font-medium">Endangered</span></td>
            <td class="p-4 text-zinc-600 dark:text-zinc-400">Very high risk of extinction in the wild</td>
            <td class="p-4">Blue Whale</td>
          </tr>
          <tr class="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
            <td class="p-4"><span class="inline-block px-2.5 py-1 rounded-full bg-rose-100 dark:bg-rose-900/40 text-rose-700 text-xs font-medium">Critically Endangered</span></td>
            <td class="p-4 text-zinc-600 dark:text-zinc-400">Extremely high risk, urgent action needed</td>
            <td class="p-4">Amur Leopard</td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="grid grid-cols-3 gap-4">
      <div class="bg-emerald-50 dark:bg-emerald-950/30 rounded-2xl p-5 space-y-2">
        <h3 class="font-bold text-emerald-700 text-sm">Protected Areas</h3>
        <p class="text-xs text-zinc-500">National parks, reserves, and marine sanctuaries safeguard habitats.</p>
      </div>
      <div class="bg-emerald-50 dark:bg-emerald-950/30 rounded-2xl p-5 space-y-2">
        <h3 class="font-bold text-emerald-700 text-sm">Captive Breeding</h3>
        <p class="text-xs text-zinc-500">Zoos and breeding programs help recover critically endangered species.</p>
      </div>
      <div class="bg-emerald-50 dark:bg-emerald-950/30 rounded-2xl p-5 space-y-2">
        <h3 class="font-bold text-emerald-700 text-sm">Legislation</h3>
        <p class="text-xs text-zinc-500">Laws like the Endangered Species Act provide legal protection.</p>
      </div>
    </div>
  </div>
</div>`),
        },
        {
          id: "sec_019",
          title: "Renewable Energy",
          totalPages: 1,
          content: JSON.stringify([
            { title: "Renewable Energy", type: "content", items: [
              { heading: "Solar", text: "Converts sunlight into electricity using photovoltaic cells." },
              { heading: "Wind", text: "Uses wind turbines to generate clean electricity." },
              { heading: "Hydropower", text: "Harnesses the energy of flowing water." },
              { heading: "Geothermal", text: "Taps into heat from the Earth's core." },
            ]},
          ]),
          htmlBody: wrapHtml("Renewable Energy", `
<div class="min-h-screen flex items-center justify-center p-8">
  <div class="max-w-5xl w-full space-y-8">
    <h1 class="text-3xl font-bold">Renewable Energy</h1>
    <div class="grid grid-cols-2 gap-6">
      <div class="rounded-2xl bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-950/30 dark:to-yellow-950/30 p-6 space-y-3">
        <div class="flex items-center gap-3"><div class="w-10 h-10 rounded-xl bg-amber-400 flex items-center justify-center text-white font-bold">S</div><h2 class="font-bold text-lg">Solar</h2></div>
        <p class="text-sm text-zinc-600 dark:text-zinc-400">Converts sunlight into electricity using photovoltaic cells. Fastest-growing energy source globally.</p>
      </div>
      <div class="rounded-2xl bg-gradient-to-br from-cyan-50 to-sky-50 dark:from-cyan-950/30 dark:to-sky-950/30 p-6 space-y-3">
        <div class="flex items-center gap-3"><div class="w-10 h-10 rounded-xl bg-cyan-400 flex items-center justify-center text-white font-bold">W</div><h2 class="font-bold text-lg">Wind</h2></div>
        <p class="text-sm text-zinc-600 dark:text-zinc-400">Uses turbines to capture kinetic energy from wind. Cost-competitive with fossil fuels.</p>
      </div>
      <div class="rounded-2xl bg-gradient-to-br from-teal-50 to-emerald-50 dark:from-teal-950/30 dark:to-emerald-950/30 p-6 space-y-3">
        <div class="flex items-center gap-3"><div class="w-10 h-10 rounded-xl bg-teal-400 flex items-center justify-center text-white font-bold">H</div><h2 class="font-bold text-lg">Hydropower</h2></div>
        <p class="text-sm text-zinc-600 dark:text-zinc-400">Harnesses energy from flowing water. Largest source of renewable electricity worldwide.</p>
      </div>
      <div class="rounded-2xl bg-gradient-to-br from-rose-50 to-red-50 dark:from-rose-950/30 dark:to-red-950/30 p-6 space-y-3">
        <div class="flex items-center gap-3"><div class="w-10 h-10 rounded-xl bg-rose-400 flex items-center justify-center text-white font-bold">G</div><h2 class="font-bold text-lg">Geothermal</h2></div>
        <p class="text-sm text-zinc-600 dark:text-zinc-400">Taps into heat from the Earth's core. Provides consistent baseload power 24/7.</p>
      </div>
    </div>
  </div>
</div>`),
        },
        {
          id: "sec_020",
          title: "Environmental Policy",
          totalPages: 1,
          content: JSON.stringify([
            { title: "Environmental Policy", type: "content", items: [
              { heading: "Kyoto Protocol (1997)", text: "First international treaty to set binding emission targets." },
              { heading: "Paris Agreement (2015)", text: "Limit global warming to 1.5 degrees C above pre-industrial levels." },
              { heading: "Key Principle", text: "Common but differentiated responsibilities based on national capabilities." },
            ]},
            { title: "Quick Check", type: "quiz", items: [{ text: "What temperature target does the Paris Agreement aim for?" }] },
          ]),
          htmlBody: wrapHtml("Environmental Policy", `
<div class="min-h-screen flex items-center justify-center p-8">
  <div class="max-w-5xl w-full space-y-8">
    <h1 class="text-3xl font-bold">Environmental Policy</h1>
    <div class="space-y-4">
      <div class="flex gap-4 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-700">
        <div class="shrink-0 w-20 text-center"><div class="text-3xl font-bold text-amber-600">1997</div></div>
        <div><h2 class="font-bold text-lg">Kyoto Protocol</h2><p class="text-sm text-zinc-600 dark:text-zinc-400 mt-1">First international treaty to set legally binding emission reduction targets for developed nations.</p></div>
      </div>
      <div class="flex gap-4 p-5 rounded-2xl border-2 border-emerald-300 dark:border-emerald-700 bg-emerald-50/50 dark:bg-emerald-950/20">
        <div class="shrink-0 w-20 text-center"><div class="text-3xl font-bold text-emerald-600">2015</div></div>
        <div><h2 class="font-bold text-lg">Paris Agreement</h2><p class="text-sm text-zinc-600 dark:text-zinc-400 mt-1">Limit global warming to 1.5 degrees C. All nations set their own nationally determined contributions (NDCs).</p></div>
      </div>
    </div>
    <div class="bg-zinc-50 dark:bg-zinc-800 rounded-2xl p-6 space-y-4">
      <h3 class="font-semibold">Quick Check</h3>
      <p class="text-sm">What temperature target does the Paris Agreement aim to stay below?</p>
      <div class="grid grid-cols-2 gap-3">
        <button class="text-left px-4 py-3 rounded-xl border-2 border-zinc-200 dark:border-zinc-700 hover:border-amber-400 text-sm transition">A. 2.0 degrees C</button>
        <button class="text-left px-4 py-3 rounded-xl border-2 border-zinc-200 dark:border-zinc-700 hover:border-amber-400 text-sm transition">B. 1.5 degrees C</button>
        <button class="text-left px-4 py-3 rounded-xl border-2 border-zinc-200 dark:border-zinc-700 hover:border-amber-400 text-sm transition">C. 0.5 degrees C</button>
        <button class="text-left px-4 py-3 rounded-xl border-2 border-zinc-200 dark:border-zinc-700 hover:border-amber-400 text-sm transition">D. 3.0 degrees C</button>
      </div>
    </div>
  </div>
</div>`),
        },
      ],
    },
    // ========================================
    // Course 5: Business Communication
    // ========================================
    {
      id: "course_005",
      title: "Business Communication",
      description: "Master professional communication skills including email writing, presentations, cross-team collaboration, negotiation, and report writing.",
      categoryId: "cat_005",
      coverImage: "https://placehold.co/800x450/059669/white?text=Business+Communication",
      language: "english",
      studentCount: 238,
      rating: 4.8,
      sections: [
        {
          id: "sec_021",
          title: "Email Writing Fundamentals",
          totalPages: 1,
          content: JSON.stringify([
            { title: "Email Writing Fundamentals", type: "content", items: [
              { heading: "Subject Line", text: "Clear, specific, and actionable. Example: Action Required: Q3 Budget Review - Due Friday" },
              { heading: "Structure", text: "Professional greeting, concise body, clear call to action, professional sign-off." },
              { heading: "Tone", text: "Match your audience. Formal for executives, conversational for peers." },
            ]},
          ]),
          htmlBody: wrapHtml("Email Writing Fundamentals", `
<div class="min-h-screen flex items-center justify-center p-8">
  <div class="max-w-5xl w-full space-y-8">
    <h1 class="text-3xl font-bold">Email Writing Fundamentals</h1>
    <div class="grid grid-cols-2 gap-8">
      <div class="space-y-4">
        <h2 class="text-xl font-bold text-emerald-700 dark:text-emerald-400">Email Anatomy</h2>
        <div class="space-y-2">
          <div class="flex items-center gap-3 p-3 bg-emerald-50 dark:bg-emerald-950/30 rounded-xl"><span class="w-6 h-6 rounded-full bg-emerald-500 text-white text-xs flex items-center justify-center font-bold">1</span><span class="text-sm"><strong>Subject:</strong> Clear &amp; actionable</span></div>
          <div class="flex items-center gap-3 p-3 bg-emerald-50 dark:bg-emerald-950/30 rounded-xl"><span class="w-6 h-6 rounded-full bg-emerald-500 text-white text-xs flex items-center justify-center font-bold">2</span><span class="text-sm"><strong>Greeting:</strong> Professional salutation</span></div>
          <div class="flex items-center gap-3 p-3 bg-emerald-50 dark:bg-emerald-950/30 rounded-xl"><span class="w-6 h-6 rounded-full bg-emerald-500 text-white text-xs flex items-center justify-center font-bold">3</span><span class="text-sm"><strong>Body:</strong> Concise, well-structured</span></div>
          <div class="flex items-center gap-3 p-3 bg-emerald-50 dark:bg-emerald-950/30 rounded-xl"><span class="w-6 h-6 rounded-full bg-emerald-500 text-white text-xs flex items-center justify-center font-bold">4</span><span class="text-sm"><strong>CTA:</strong> Clear next steps</span></div>
          <div class="flex items-center gap-3 p-3 bg-emerald-50 dark:bg-emerald-950/30 rounded-xl"><span class="w-6 h-6 rounded-full bg-emerald-500 text-white text-xs flex items-center justify-center font-bold">5</span><span class="text-sm"><strong>Sign-off:</strong> Professional closing</span></div>
        </div>
      </div>
      <div class="space-y-4">
        <h2 class="text-xl font-bold text-rose-700 dark:text-rose-400">Common Mistakes</h2>
        <div class="rounded-2xl border border-zinc-200 dark:border-zinc-700 overflow-hidden">
          <table class="w-full text-sm">
            <thead><tr class="bg-zinc-100 dark:bg-zinc-800"><th class="text-left p-3 font-semibold">Mistake</th><th class="text-left p-3 font-semibold">Fix</th></tr></thead>
            <tbody class="divide-y divide-zinc-100 dark:divide-zinc-800">
              <tr><td class="p-3 text-zinc-600">Vague subject line</td><td class="p-3 text-zinc-500">Be specific and action-oriented</td></tr>
              <tr><td class="p-3 text-zinc-600">Wall of text</td><td class="p-3 text-zinc-500">Use bullet points and short paragraphs</td></tr>
              <tr><td class="p-3 text-zinc-600">No call to action</td><td class="p-3 text-zinc-500">End with clear next steps</td></tr>
              <tr><td class="p-3 text-zinc-600">Reply all unnecessarily</td><td class="p-3 text-zinc-500">Think before adding recipients</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</div>`),
        },
        {
          id: "sec_022",
          title: "Presentation Skills",
          totalPages: 1,
          content: JSON.stringify([
            { title: "Presentation Skills", type: "list", items: [
              { text: "One idea per slide - Do not overcrowd" },
              { text: "Use visuals over text - People remember images better" },
              { text: "Consistent formatting - Same fonts, colors, layouts" },
              { text: "Limit text to 6 lines per slide" },
            ]},
          ]),
          htmlBody: wrapHtml("Presentation Skills", `
<div class="min-h-screen flex items-center justify-center p-8">
  <div class="max-w-5xl w-full space-y-8">
    <h1 class="text-3xl font-bold">Presentation Skills</h1>
    <div class="grid grid-cols-2 gap-8">
      <div class="space-y-4">
        <h2 class="text-xl font-bold text-emerald-700 dark:text-emerald-400">Slide Design Principles</h2>
        <div class="space-y-3">
          <div class="p-4 bg-zinc-50 dark:bg-zinc-800 rounded-xl flex items-start gap-3">
            <span class="text-emerald-500 font-bold mt-0.5">&#10003;</span>
            <div><p class="font-medium text-sm">One idea per slide</p><p class="text-xs text-zinc-500">Do not overcrowd your slides</p></div>
          </div>
          <div class="p-4 bg-zinc-50 dark:bg-zinc-800 rounded-xl flex items-start gap-3">
            <span class="text-emerald-500 font-bold mt-0.5">&#10003;</span>
            <div><p class="font-medium text-sm">Visuals over text</p><p class="text-xs text-zinc-500">People remember images better</p></div>
          </div>
          <div class="p-4 bg-zinc-50 dark:bg-zinc-800 rounded-xl flex items-start gap-3">
            <span class="text-emerald-500 font-bold mt-0.5">&#10003;</span>
            <div><p class="font-medium text-sm">Consistent formatting</p><p class="text-xs text-zinc-500">Same fonts, colors, and layouts</p></div>
          </div>
          <div class="p-4 bg-zinc-50 dark:bg-zinc-800 rounded-xl flex items-start gap-3">
            <span class="text-emerald-500 font-bold mt-0.5">&#10003;</span>
            <div><p class="font-medium text-sm">Max 6 lines per slide</p><p class="text-xs text-zinc-500">Keep it scannable and clean</p></div>
          </div>
        </div>
      </div>
      <div class="space-y-4">
        <h2 class="text-xl font-bold text-emerald-700 dark:text-emerald-400">Delivery Tips</h2>
        <div class="space-y-3">
          <div class="p-4 bg-emerald-50 dark:bg-emerald-950/30 rounded-xl"><p class="font-medium text-sm">Body Language</p><p class="text-xs text-zinc-500 mt-1">Maintain eye contact, use open gestures, move purposefully.</p></div>
          <div class="p-4 bg-emerald-50 dark:bg-emerald-950/30 rounded-xl"><p class="font-medium text-sm">Voice</p><p class="text-xs text-zinc-500 mt-1">Vary your pace, volume, and tone to maintain engagement.</p></div>
          <div class="p-4 bg-emerald-50 dark:bg-emerald-950/30 rounded-xl"><p class="font-medium text-sm">Practice</p><p class="text-xs text-zinc-500 mt-1">Rehearse out loud at least 3 times before presenting.</p></div>
        </div>
      </div>
    </div>
  </div>
</div>`),
        },
        {
          id: "sec_023",
          title: "Cross-Team Communication",
          totalPages: 1,
          content: JSON.stringify([
            { title: "Cross-Team Communication", type: "table", tableData: { headers: ["Tool Type", "Best For", "Avoid Using For"], rows: [
              ["Slack / Teams", "Quick questions, updates", "Complex discussions, decisions"],
              ["Email", "Formal communication, records", "Urgent matters"],
              ["Video Call", "Brainstorming, complex topics", "Quick status updates"],
              ["Documentation", "Reference material, SOPs", "Time-sensitive communication"],
            ]} },
          ]),
          htmlBody: wrapHtml("Cross-Team Communication", `
<div class="min-h-screen flex items-center justify-center p-8">
  <div class="max-w-5xl w-full space-y-8">
    <h1 class="text-3xl font-bold">Cross-Team Communication</h1>
    <div class="rounded-2xl border border-zinc-200 dark:border-zinc-700 overflow-hidden">
      <table class="w-full text-sm">
        <thead><tr class="bg-zinc-100 dark:bg-zinc-800">
          <th class="text-left p-4 font-semibold">Tool Type</th>
          <th class="text-left p-4 font-semibold">Best For</th>
          <th class="text-left p-4 font-semibold">Avoid Using For</th>
        </tr></thead>
        <tbody class="divide-y divide-zinc-100 dark:divide-zinc-800">
          <tr class="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
            <td class="p-4 font-medium">Slack / Teams</td>
            <td class="p-4 text-zinc-600 dark:text-zinc-400">Quick questions, updates</td>
            <td class="p-4 text-zinc-500">Complex discussions, decisions</td>
          </tr>
          <tr class="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
            <td class="p-4 font-medium">Email</td>
            <td class="p-4 text-zinc-600 dark:text-zinc-400">Formal communication, records</td>
            <td class="p-4 text-zinc-500">Urgent matters</td>
          </tr>
          <tr class="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
            <td class="p-4 font-medium">Video Call</td>
            <td class="p-4 text-zinc-600 dark:text-zinc-400">Brainstorming, complex topics</td>
            <td class="p-4 text-zinc-500">Quick status updates</td>
          </tr>
          <tr class="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
            <td class="p-4 font-medium">Documentation</td>
            <td class="p-4 text-zinc-600 dark:text-zinc-400">Reference material, SOPs</td>
            <td class="p-4 text-zinc-500">Time-sensitive communication</td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="grid grid-cols-2 gap-4">
      <div class="bg-emerald-50 dark:bg-emerald-950/30 rounded-2xl p-5 space-y-2">
        <h3 class="font-bold text-emerald-700 text-sm">Best Practice: Context</h3>
        <p class="text-xs text-zinc-500">Always provide enough background when communicating across teams. Assume no prior knowledge.</p>
      </div>
      <div class="bg-emerald-50 dark:bg-emerald-950/30 rounded-2xl p-5 space-y-2">
        <h3 class="font-bold text-emerald-700 text-sm">Best Practice: Over-communicate</h3>
        <p class="text-xs text-zinc-500">It is better to share too much information than too little. Use async updates to keep everyone aligned.</p>
      </div>
    </div>
  </div>
</div>`),
        },
        {
          id: "sec_024",
          title: "Negotiation Skills",
          totalPages: 1,
          content: JSON.stringify([
            { title: "Negotiation Skills", type: "content", items: [
              { heading: "Preparation", text: "Research the other party, define your BATNA (Best Alternative to a Negotiated Agreement)." },
              { heading: "Active Listening", text: "Listen to understand, not just to respond. Ask clarifying questions." },
              { heading: "Win-Win Mindset", text: "Seek solutions that create value for both parties, not zero-sum games." },
            ]},
          ]),
          htmlBody: wrapHtml("Negotiation Skills", `
<div class="min-h-screen flex items-center justify-center p-8">
  <div class="max-w-5xl w-full space-y-8">
    <h1 class="text-3xl font-bold">Negotiation Skills</h1>
    <div class="grid grid-cols-3 gap-6">
      <div class="rounded-2xl border-2 border-emerald-200 dark:border-emerald-800 p-6 space-y-3">
        <div class="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center text-emerald-600 font-bold">1</div>
        <h2 class="font-bold">Preparation</h2>
        <p class="text-sm text-zinc-600 dark:text-zinc-400">Research the other party. Define your BATNA (Best Alternative to a Negotiated Agreement). Know your limits.</p>
      </div>
      <div class="rounded-2xl border-2 border-teal-200 dark:border-teal-800 p-6 space-y-3">
        <div class="w-10 h-10 rounded-xl bg-teal-100 dark:bg-teal-900/50 flex items-center justify-center text-teal-600 font-bold">2</div>
        <h2 class="font-bold">Active Listening</h2>
        <p class="text-sm text-zinc-600 dark:text-zinc-400">Listen to understand, not to respond. Ask clarifying questions. Paraphrase to confirm understanding.</p>
      </div>
      <div class="rounded-2xl border-2 border-cyan-200 dark:border-cyan-800 p-6 space-y-3">
        <div class="w-10 h-10 rounded-xl bg-cyan-100 dark:bg-cyan-900/50 flex items-center justify-center text-cyan-600 font-bold">3</div>
        <h2 class="font-bold">Win-Win Mindset</h2>
        <p class="text-sm text-zinc-600 dark:text-zinc-400">Seek solutions that create value for both parties. Move beyond zero-sum thinking.</p>
      </div>
    </div>
    <div class="bg-zinc-50 dark:bg-zinc-800 rounded-2xl p-6">
      <h3 class="font-semibold mb-3">Key Framework: Harvard Negotiation Project</h3>
      <div class="grid grid-cols-4 gap-3 text-center text-sm">
        <div class="p-3 bg-white dark:bg-zinc-700 rounded-xl"><p class="font-bold">Separate</p><p class="text-xs text-zinc-500">People from problem</p></div>
        <div class="p-3 bg-white dark:bg-zinc-700 rounded-xl"><p class="font-bold">Focus on</p><p class="text-xs text-zinc-500">Interests, not positions</p></div>
        <div class="p-3 bg-white dark:bg-zinc-700 rounded-xl"><p class="font-bold">Generate</p><p class="text-xs text-zinc-500">Options for mutual gain</p></div>
        <div class="p-3 bg-white dark:bg-zinc-700 rounded-xl"><p class="font-bold">Use</p><p class="text-xs text-zinc-500">Objective criteria</p></div>
      </div>
    </div>
  </div>
</div>`),
        },
        {
          id: "sec_025",
          title: "Written Reports and Proposals",
          totalPages: 1,
          content: JSON.stringify([
            { title: "Written Reports and Proposals", type: "list", items: [
              { text: "Executive Summary - Key findings and recommendations on one page" },
              { text: "Introduction - Context, objectives, and scope" },
              { text: "Methodology - How you gathered and analyzed data" },
              { text: "Findings - Present data with clear visualizations" },
              { text: "Conclusion & Recommendations - Actionable next steps" },
            ]},
          ]),
          htmlBody: wrapHtml("Written Reports and Proposals", `
<div class="min-h-screen flex items-center justify-center p-8">
  <div class="max-w-5xl w-full space-y-8">
    <h1 class="text-3xl font-bold">Written Reports &amp; Proposals</h1>
    <div class="space-y-3">
      <div class="flex items-center gap-4 p-4 bg-zinc-50 dark:bg-zinc-800 rounded-xl">
        <span class="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center text-emerald-600 font-bold text-sm shrink-0">1</span>
        <div><p class="font-semibold">Executive Summary</p><p class="text-sm text-zinc-500">Key findings and recommendations on one page</p></div>
      </div>
      <div class="flex items-center gap-4 p-4 bg-zinc-50 dark:bg-zinc-800 rounded-xl">
        <span class="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center text-emerald-600 font-bold text-sm shrink-0">2</span>
        <div><p class="font-semibold">Introduction</p><p class="text-sm text-zinc-500">Context, objectives, and scope of the report</p></div>
      </div>
      <div class="flex items-center gap-4 p-4 bg-zinc-50 dark:bg-zinc-800 rounded-xl">
        <span class="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center text-emerald-600 font-bold text-sm shrink-0">3</span>
        <div><p class="font-semibold">Methodology</p><p class="text-sm text-zinc-500">How you gathered and analyzed the data</p></div>
      </div>
      <div class="flex items-center gap-4 p-4 bg-zinc-50 dark:bg-zinc-800 rounded-xl">
        <span class="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center text-emerald-600 font-bold text-sm shrink-0">4</span>
        <div><p class="font-semibold">Findings</p><p class="text-sm text-zinc-500">Present data with clear visualizations and analysis</p></div>
      </div>
      <div class="flex items-center gap-4 p-4 bg-zinc-50 dark:bg-zinc-800 rounded-xl">
        <span class="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center text-emerald-600 font-bold text-sm shrink-0">5</span>
        <div><p class="font-semibold">Conclusion &amp; Recommendations</p><p class="text-sm text-zinc-500">Actionable next steps and implementation plan</p></div>
      </div>
    </div>
  </div>
</div>`),
        },
      ],
    },
  ];

  // ============================================
  // Create courses with sections
  // ============================================
  for (const seed of courseSeeds) {
    await prisma.course.create({
      data: {
        id: seed.id,
        title: seed.title,
        description: seed.description,
        coverImage: seed.coverImage,
        rating: seed.rating,
        studentCount: seed.studentCount,
        status: "published",
        language: seed.language,
        categoryId: seed.categoryId,
        creatorId: "user_instructor_001",
        sections: {
          create: seed.sections.map((sec, index) => ({
            id: sec.id,
            title: sec.title,
            content: sec.content,
            htmlBody: sec.htmlBody,
            totalPages: sec.totalPages,
            order: index + 1,
          })),
        },
      },
    });
    console.log(`Created course: ${seed.title}`);
  }

  // ============================================
  // Create enrollments for demo user
  // ============================================
  await prisma.enrollment.create({
    data: {
      userId: student1.id,
      courseId: "course_001",
      status: "in_progress",
      progresses: {
        create: [
          { sectionId: "sec_001", completed: true, currentPage: 1 },
          { sectionId: "sec_002", completed: false, currentPage: 1 },
        ],
      },
    },
  });

  await prisma.enrollment.create({
    data: {
      userId: student1.id,
      courseId: "course_003",
      status: "completed",
      completedAt: new Date("2026-07-20"),
      progresses: {
        create: [
          { sectionId: "sec_011", completed: true, currentPage: 1 },
          { sectionId: "sec_012", completed: true, currentPage: 1 },
        ],
      },
    },
  });

  // Create some favorites
  await prisma.favorite.create({ data: { userId: student1.id, courseId: "course_002" } });
  await prisma.favorite.create({ data: { userId: student1.id, courseId: "course_005" } });

  // ============================================
  // Create additional demo users for comments
  // ============================================
  const user2 = await prisma.user.create({
    data: { id: "user_demo_002", email: "sarah.trainer@company.com", password: "demo123", name: "Sarah Chen", avatar: null, role: "instructor", department: "Product" },
  });
  const user3 = await prisma.user.create({
    data: { id: "user_demo_003", email: "mike.jones@company.com", password: "demo123", name: "Mike Jones", avatar: null, role: "student", department: "Engineering" },
  });
  console.log(`Created users: ${user2.name}, ${user3.name}`);

  // ============================================
  // Create comments for discussion
  // ============================================
  await prisma.comment.create({
    data: {
      id: "comment_001",
      content: "This section on logical fallacies was incredibly helpful! I never realized how often I encounter ad hominem arguments in meetings. Can anyone recommend additional resources on identifying cognitive biases?",
      courseId: "course_001",
      sectionId: "sec_004",
      userId: student1.id,
      createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    },
  });
  await prisma.comment.create({
    data: {
      id: "comment_002",
      content: "Great question, Alex! I'd recommend Daniel Kahneman's 'Thinking, Fast and Slow' \u2014 it covers cognitive biases in depth and is very accessible.",
      courseId: "course_001",
      sectionId: "sec_004",
      userId: "user_demo_002",
      parentId: "comment_001",
      createdAt: new Date(Date.now() - 1 * 60 * 60 * 1000),
    },
  });
  await prisma.comment.create({
    data: {
      id: "comment_003",
      content: "The email templates in this course saved me so much time. I've already started using the meeting request template and my colleagues noticed the improvement!",
      courseId: "course_005",
      sectionId: "sec_021",
      userId: "user_demo_003",
      createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    },
  });
  await prisma.comment.create({
    data: {
      id: "comment_004",
      content: "Is there a follow-up course that covers more advanced communication topics like cross-cultural communication?",
      courseId: "course_005",
      userId: student1.id,
      createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
    },
  });
  await prisma.comment.create({
    data: {
      id: "comment_005",
      content: "The Polya method section was eye-opening. I've been using it at work to break down complex engineering problems. Highly recommended for anyone in a technical role.",
      courseId: "course_001",
      sectionId: "sec_005",
      userId: "user_demo_003",
      createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
    },
  });
  await prisma.comment.create({
    data: {
      id: "comment_006",
      content: "I agree! The 'Look Back' step is something most people skip but it really helps solidify understanding.",
      courseId: "course_001",
      sectionId: "sec_005",
      userId: "user_demo_002",
      parentId: "comment_005",
      createdAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
    },
  });
  await prisma.comment.create({
    data: {
      id: "comment_007",
      content: "The Python Programming course was very practical. I wish we had this training when I first joined the company. The data structures section alone is worth the time.",
      courseId: "course_003",
      userId: "user_demo_002",
      createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    },
  });
  await prisma.comment.create({
    data: {
      id: "comment_008",
      content: "The quiz at the end of each section really helps reinforce the concepts. I found myself going back to review content I thought I already understood.",
      courseId: "course_001",
      userId: student1.id,
      createdAt: new Date(Date.now() - 6 * 60 * 60 * 1000),
    },
  });
  console.log("Created 8 comments (including 2 replies)");

  // ============================================
  // Create notifications for demo user
  // ============================================
  const now = new Date();
  await prisma.notification.createMany({
    data: [
      {
        id: "notif_001",
        userId: student1.id,
        title: "New Course Available",
        message: "Python Programming has been published. Check it out!",
        type: "course",
        read: false,
        link: "course-detail:course_003",
        createdAt: new Date(now.getTime() - 15 * 60 * 1000),
      },
      {
        id: "notif_002",
        userId: student1.id,
        title: "Achievement Unlocked!",
        message: "You completed your first course. Keep up the great work!",
        type: "achievement",
        read: false,
        link: null,
        createdAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
      },
      {
        id: "notif_003",
        userId: student1.id,
        title: "Enrollment Confirmed",
        message: "You are now enrolled in Mathematical Thinking.",
        type: "success",
        read: false,
        link: "course-detail:course_001",
        createdAt: new Date(now.getTime() - 5 * 60 * 60 * 1000),
      },
      {
        id: "notif_004",
        userId: student1.id,
        title: "Weekly Learning Reminder",
        message: "You haven't started a course this week. Keep your learning streak going!",
        type: "warning",
        read: false,
        link: null,
        createdAt: new Date(now.getTime() - 24 * 60 * 60 * 1000),
      },
      {
        id: "notif_005",
        userId: user.id,
        title: "New Student Enrolled",
        message: "Alex Johnson enrolled in your course Mathematical Thinking.",
        type: "course",
        read: true,
        link: "course-detail:course_001",
        createdAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000),
      },
      {
        id: "notif_006",
        userId: user.id,
        title: "System Update",
        message: "Platform v1.0 is now live with new features and improvements.",
        type: "system",
        read: true,
        link: null,
        createdAt: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000),
      },
      {
        id: "notif_007",
        userId: student2.id,
        title: "Streak Milestone",
        message: "Congratulations! You've maintained a 7-day learning streak.",
        type: "achievement",
        read: false,
        link: "profile",
        createdAt: new Date(now.getTime() - 8 * 60 * 60 * 1000),
      },
      {
        id: "notif_008",
        userId: user.id,
        title: "New Reply to Student Question",
        message: "Sarah Chen replied to Alex's question in Mathematical Thinking.",
        type: "info",
        read: true,
        link: "course-detail:course_001",
        createdAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
      },
    ],
  });
  console.log("Created 8 sample notifications");

  console.log("\nSeed completed successfully!");
  console.log(`   - 5 users, ${categories.length} categories, ${courseSeeds.length} courses`);
  console.log("   - 2 enrollments, 2 favorites, 8 comments, 8 notifications created\n");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
