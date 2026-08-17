#!/usr/bin/env python3
"""Generate prisma/seed.ts with htmlBody fields for 5 courses x 5 sections."""

OUTPUT = "/home/z/my-project/prisma/seed.ts"

def w(title, body):
    """Wrap HTML body in full document."""
    # Escape backticks and ${ for JS template literals
    body = body.replace('`', "'" )
    body = body.replace('$', '\$')
    return f'`<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="UTF-8" />\n<meta name="viewport" content="width=device-width, initial-scale=1.0" />\n<title>{title}</title>\n<script src="https://cdn.tailwindcss.com"><\/script>\n<style>body {{ margin: 0; padding: 0; font-family: system-ui, -apple-system, sans-serif; }}\n* {{ box-sizing: border-box; }}</style>\n</head>\n<body class="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">\n{body}\n</body>\n</html>`'

def out(line=""):
    parts.append(line)

parts = []

# ===== HEADER =====
out('import { PrismaClient } from "@prisma/client";')
out('')
out('const prisma = new PrismaClient();')
out('')
out('function wrapHtml(title: string, body: string): string {')
out('  return `<!DOCTYPE html>')
out('<html lang="en">')
out('<head>')
out('<meta charset="UTF-8" />')
out('<meta name="viewport" content="width=device-width, initial-scale=1.0" />')
out('<title>${title}</title>')
out('<script src="https://cdn.tailwindcss.com"></script>')
out('<style>body { margin: 0; padding: 0; font-family: system-ui, -apple-system, sans-serif; }')
out('* { box-sizing: border-box; }</style>')
out('</head>')
out('<body class="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">')
out('${body}')
out('</body>')
out('</html>`;')
out('}')
out('')

# ===== MAIN FUNCTION =====
out('async function main() {')
out('  console.log("⚘️ Seeding LMS database...\\n");')
out('')

# Clean
for model in ['notification', 'comment', 'favorite', 'progress', 'enrollment', 'section', 'course', 'category', 'user']:
    out(f'  await prisma.{model}.deleteMany();')

out('')

# ===== USERS =====
out('  // ============================================')
out('  // Create users (instructor + students)')
out('  // ============================================')
out('  const user = await prisma.user.create({')
out('    data: { id: "user_instructor_001", email: "instructor@ecotech.com", name: "Dr. Sarah Chen", avatar: null, role: "instructor", department: "Faculty" },')
out('  });')
out('  console.log(`\u{1F464} Created user: ${user.name}`);')
out('')
out('  const student1 = await prisma.user.create({')
out('    data: { id: "user_student_001", email: "alex.student@ecotech.com", name: "Alex Johnson", avatar: null, role: "student", department: "Computer Science" },')
out('  });')
out('')
out('  const student2 = await prisma.user.create({')
out('    data: { id: "user_student_002", email: "maria.student@ecotech.com", name: "Maria Garcia", avatar: null, role: "student", department: "Data Science" },')
out('  });')
out('  console.log(`\u{1F464} Created students: ${student1.name}, ${student2.name}`);')
out('')

# ===== CATEGORIES =====
out('  // ============================================')
out('  // Create categories')
out('  // ============================================')
out('  const categories = await Promise.all([')
cats = [
    ('cat_001', 'Subject Education', 'Core academic subjects and foundational knowledge', '#0d9488'),
    ('cat_002', 'Life Skills', 'Practical skills for everyday life', '#d97706'),
    ('cat_003', 'Business Knowledge', 'Business acumen and professional skills', '#e11d48'),
    ('cat_004', 'Technology', 'Technical skills and IT knowledge', '#7c3aed'),
    ('cat_005', 'Communication', 'Writing, speaking, and interpersonal skills', '#059669'),
    ('cat_006', 'Safety & Compliance', 'Workplace safety and regulatory compliance', '#dc2626'),
]
for cat in cats:
    out(f'    prisma.category.create({{ data: {{ id: "{cat[0]}", name: "{cat[1]}", description: "{cat[2]}", color: "{cat[3]}" }} }}),')
out('  ]);')
out('  console.log(`\u{1F4C2} Created ${categories.length} categories`);')
out('')

# ===== COURSE SEEDS TYPE =====
out('  // ============================================')
out('  // Course seed data (5 courses \u00d7 5 sections)')
out('  // ============================================')
out('  const courseSeeds: Array<{')
out('    id: string; title: string; description: string; categoryId: string;')
out('    coverImage: string; language: string; studentCount: number; rating: number;')
out('    sections: {{ id: string; title: string; totalPages: number; content: string; htmlBody: string }}[];')
out('  }> = [')

# ===== SECTION DEFINITIONS =====
# Each section: (id, title, content_json, html_body_content)
# html_body_content is just the <body> inner HTML (no wrapper needed, wrapHtml handles it)

sections_data = []

# ---- Course 1: Mathematical Thinking ----
sections_data.append({
    "course_id": "course_001", "course_title": "Mathematical Thinking",
    "course_desc": "Develop logical reasoning and problem-solving skills through mathematical concepts. Learn to approach complex problems systematically and build strong analytical foundations.",
    "course_cat": "cat_001", "course_cover": "https://placehold.co/800x450/0d9488/white?text=Mathematical+Thinking",
    "course_lang": "english", "course_students": 142, "course_rating": 4.5,
    "sections": [
        {
            "id": "sec_001", "title": "Introduction to Logical Reasoning",
            "content": '[{"title":"Introduction to Logical Reasoning","type":"title","subtitle":"Building the foundation for mathematical thinking"},{"title":"What You will Learn","type":"list","items":[{"text":"The three pillars of logical reasoning"},{"text":"How to identify and avoid logical fallacies"},{"text":"Applying structured thinking to real problems"}]}]',
            "body": '''<div class="min-h-screen flex items-center justify-center p-8">
  <div class="max-w-4xl w-full text-center space-y-10">
    <div class="inline-block px-4 py-1.5 rounded-full bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 text-sm font-medium tracking-wide uppercase">Module 1</div>
    <h1 class="text-5xl font-extrabold leading-tight">
      <span class="bg-gradient-to-r from-teal-600 to-cyan-500 bg-clip-text text-transparent">Introduction to</span><br/>
      <span class="text-zinc-900 dark:text-zinc-100">Logical Reasoning</span>
    </h1>
    <p class="text-xl text-zinc-500 dark:text-zinc-400 max-w-2xl mx-auto">Building the foundation for mathematical thinking and analytical problem solving</p>
    <div class="grid grid-cols-3 gap-6 pt-4">
      <div class="bg-zinc-50 dark:bg-zinc-800 rounded-2xl p-6 space-y-3"><h3 class="font-semibold text-lg">Deductive</h3><p class="text-sm text-zinc-500">General to Specific</p></div>
      <div class="bg-zinc-50 dark:bg-zinc-800 rounded-2xl p-6 space-y-3"><h3 class="font-semibold text-lg">Inductive</h3><p class="text-sm text-zinc-500">Specific to General</p></div>
      <div class="bg-zinc-50 dark:bg-zinc-800 rounded-2xl p-6 space-y-3"><h3 class="font-semibold text-lg">Abductive</h3><p class="text-sm text-zinc-500">Best Explanation</p></div>
    </div>
  </div>
</div>'''
        },
        {
            "id": "sec_002", "title": "Deductive and Inductive Reasoning",
            "content": '[{"title":"Deductive and Inductive Reasoning","type":"content","items":[{"heading":"Deductive Reasoning","text":"Starts with a general premise and reaches a specific conclusion. If premises are true, conclusion must be true."},{"heading":"Inductive Reasoning","text":"Observes specific instances and draws a general conclusion. Conclusions are probable but not guaranteed."}]}]',
            "body": '''<div class="min-h-screen flex items-center justify-center p-8">
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
</div>'''
        },
        {
            "id": "sec_003", "title": "Patterns and Sequences",
            "content": '[{"title":"Patterns and Sequences","type":"content","items":[{"heading":"Arithmetic Sequences","text":"Each term differs by a constant d. Formula: an = a1 + (n-1)d"},{"heading":"Geometric Sequences","text":"Each term multiplied by constant r. Formula: an = a1 * r^(n-1)"},{"heading":"Fibonacci Sequence","text":"1, 1, 2, 3, 5, 8, 13... Found throughout nature."}]}]',
            "body": '''<div class="min-h-screen flex items-center justify-center p-8">
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
</div>'''
        },
        {
            "id": "sec_004", "title": "Common Logical Fallacies",
            "content": '[{"title":"Common Logical Fallacies","type":"table","tableData":{"headers":["Fallacy","Description","Example"],"rows":[["Ad Hominem","Attacking the person, not the argument","You cannot trust his math, he is a musician"],["Straw Man","Misrepresenting the argument","Oversimplifying an opponents position"],["Circular Reasoning","Begging the question","X is true because X is true"]]}}]',
            "body": '''<div class="min-h-screen flex items-center justify-center p-8">
  <div class="max-w-5xl w-full space-y-6">
    <h1 class="text-3xl font-bold">Common Logical Fallacies</h1>
    <p class="text-zinc-500">Recognizing these traps strengthens your reasoning.</p>
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
</div>'''
        },
        {
            "id": "sec_005", "title": "Problem Solving Strategies",
            "content": '[{"title":"Problem Solving Strategies","type":"list","items":[{"text":"1. Understand the Problem - Identify givens and goals"},{"text":"2. Devise a Plan - Choose a strategy"},{"text":"3. Carry out the Plan - Execute step by step"},{"text":"4. Look Back - Verify and consider alternatives"}]},{"title":"Quick Check","type":"quiz","items":[{"text":"Which strategy involves reversing the steps from the desired outcome?"}]}]',
            