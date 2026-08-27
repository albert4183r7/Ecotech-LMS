// A seed script is run directly by node, whose ESM resolver requires explicit
// file extensions, so it cannot import the app's db module by its TypeScript
// path. Owning the client here also keeps the app's query logging out of the
// seed output and closes the connection deterministically.
import { PrismaClient } from '@prisma/client'
// Relative with an explicit extension: this file is run directly by node, so
// the app's "@/..." path alias does not resolve here. Sharing the hasher
// rather than repeating it keeps the seeded accounts on the same parameters
// the login route verifies against.
import { hashPassword } from '../src/lib/password.ts'

const db = new PrismaClient()

// ============================================================
// Helper: build a full HTML+Tailwind slide document
// ============================================================
function makeSlideHtml(title: string, paragraphs: string[]): string {
  const bodyHtml = paragraphs
    .map((p) => `      <p class="text-slate-300 text-lg leading-relaxed">${p}</p>`)
    .join('\n')
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gradient-to-br from-slate-900 to-slate-800 text-white flex items-center justify-center min-h-screen m-0 p-0">
  <div class="max-w-3xl w-full px-12">
    <h1 class="text-3xl font-bold mb-6 bg-gradient-to-r from-teal-400 to-cyan-300 bg-clip-text text-transparent">${title}</h1>
    <div class="space-y-4 text-slate-300 text-lg leading-relaxed">
${bodyHtml}
    </div>
  </div>
</body>
</html>`
}

// ============================================================
// Lesson seed data: title, topic (for outlineJson), slide content
// ============================================================
interface LessonSeed {
  id: string
  title: string
  topic: string
  outline: string
  paragraphs: string[]
}

// ============================================================
// Course seed data
// ============================================================
interface CourseSeed {
  id: string
  title: string
  description: string
  categoryId: string
  coverImage: string
  language: string
  studentCount: number
  rating: number
  lessons: LessonSeed[]
}

const courseSeeds: CourseSeed[] = [
  // ========================================
  // Course 1: Mathematical Thinking
  // ========================================
  {
    id: 'course_001',
    title: 'Mathematical Thinking',
    description:
      'Develop logical reasoning and problem-solving skills through mathematical concepts. Learn to approach complex problems systematically and build strong analytical foundations.',
    categoryId: 'cat_001',
    coverImage: 'https://placehold.co/800x450/0d9488/white?text=Mathematical+Thinking',
    language: 'english',
    studentCount: 142,
    rating: 4.5,
    lessons: [
      {
        id: 'lesson_001',
        title: 'Introduction to Logical Reasoning',
        topic: 'Mathematical Thinking',
        outline: 'Building the foundation for mathematical thinking and analytical problem solving',
        paragraphs: [
          'Logical reasoning is the process of drawing valid conclusions from given premises using structured thinking. It forms the backbone of mathematics, computer science, and everyday decision-making.',
          'There are three main types of logical reasoning: <strong>Deductive reasoning</strong> moves from general principles to specific conclusions, <strong>Inductive reasoning</strong> generalizes from specific observations, and <strong>Abductive reasoning</strong> seeks the most likely explanation for incomplete observations.',
          'Mastering logical reasoning helps you identify flawed arguments, avoid cognitive biases, and make better decisions in both academic and professional settings.',
        ],
      },
      {
        id: 'lesson_002',
        title: 'Deductive and Inductive Reasoning',
        topic: 'Mathematical Thinking',
        outline: 'Comparing deductive and inductive approaches to logical reasoning',
        paragraphs: [
          '<strong>Deductive reasoning</strong> starts with a general premise and reaches a specific, guaranteed conclusion. For example: if all humans are mortal and Socrates is human, then Socrates is mortal. If the premises are true, the conclusion must be true.',
          '<strong>Inductive reasoning</strong> observes specific instances and draws a probable general conclusion. For example: every swan you have seen is white, so all swans might be white. Conclusions are probable but never guaranteed — a single black swan disproves the rule.',
          'In practice, mathematicians use both: deduction to prove theorems and induction to form hypotheses. Understanding when to apply each approach is essential for rigorous analytical thinking.',
        ],
      },
      {
        id: 'lesson_003',
        title: 'Patterns and Sequences',
        topic: 'Mathematical Thinking',
        outline: 'Recognizing and working with arithmetic, geometric, and Fibonacci sequences',
        paragraphs: [
          '<strong>Arithmetic sequences</strong> increase (or decrease) by a constant difference. The formula a<sub>n</sub> = a<sub>1</sub> + (n-1)d lets you find any term directly. Example: 2, 5, 8, 11, 14… where each step adds 3.',
          '<strong>Geometric sequences</strong> multiply each term by a constant ratio. The formula a<sub>n</sub> = a<sub>1</sub> &middot; r<sup>(n-1)</sup> applies. Example: 3, 6, 12, 24, 48… where each step doubles.',
          'The <strong>Fibonacci sequence</strong> (1, 1, 2, 3, 5, 8, 13…) is generated by adding the two previous terms. It appears throughout nature in sunflower spirals, nautilus shells, and branching trees — a beautiful link between math and the natural world.',
        ],
      },
      {
        id: 'lesson_004',
        title: 'Common Logical Fallacies',
        topic: 'Mathematical Thinking',
        outline: 'Identifying and avoiding logical fallacies that weaken arguments',
        paragraphs: [
          '<strong>Ad Hominem</strong> attacks the person instead of their argument. Example: "You cannot trust his math because he is a musician." The person\'s profession has no bearing on the validity of their reasoning.',
          '<strong>Straw Man</strong> misrepresents or oversimplifies an argument to make it easier to attack. Always represent your opponent\'s position fairly before responding.',
          '<strong>Circular Reasoning</strong> assumes the conclusion within the premise — essentially saying "X is true because X is true." <strong>False Dilemma</strong> presents only two options when more exist. Recognizing these fallacies makes you a stronger thinker and communicator.',
        ],
      },
      {
        id: 'lesson_005',
        title: 'Problem Solving Strategies',
        topic: 'Mathematical Thinking',
        outline: 'Applying Polya\'s four-step method and other strategies to solve problems',
        paragraphs: [
          'George P&oacute;lya\'s <strong>four-step method</strong> provides a universal framework: <strong>(1) Understand</strong> the problem — identify what is given and what is asked; <strong>(2) Devise a plan</strong> — choose a strategy such as drawing a diagram, working backwards, or looking for a pattern.',
          '<strong>(3) Carry out the plan</strong> — execute your strategy step by step, checking your work as you go. <strong>(4) Look back</strong> — verify the answer, consider alternative solutions, and reflect on what you learned.',
          'This structured approach works far beyond mathematics — it is used in engineering, software development, and business strategy. The "Look Back" step is often skipped but is critical for deep learning and improvement.',
        ],
      },
    ],
  },
  // ========================================
  // Course 2: Data Science Fundamentals
  // ========================================
  {
    id: 'course_002',
    title: 'Data Science Fundamentals',
    description:
      'Learn the fundamentals of data science including data collection, cleaning, statistical analysis, and visualization. Build a strong foundation for working with data.',
    categoryId: 'cat_004',
    coverImage: 'https://placehold.co/800x450/7c3aed/white?text=Data+Science+Fundamentals',
    language: 'english',
    studentCount: 189,
    rating: 4.6,
    lessons: [
      {
        id: 'lesson_006',
        title: 'What is Data Science?',
        topic: 'Data Science Fundamentals',
        outline: 'Understanding the interdisciplinary field of data science and its workflow',
        paragraphs: [
          'Data science is an interdisciplinary field that uses scientific methods, processes, algorithms, and systems to extract knowledge and actionable insights from structured and unstructured data.',
          'The typical data science workflow follows four stages: <strong>Collect</strong> data from databases, APIs, and surveys; <strong>Clean</strong> it by removing errors and inconsistencies; <strong>Analyze</strong> it with statistical methods and machine learning; and <strong>Visualize</strong> the results through charts and dashboards.',
          'Data scientists work at the intersection of statistics, programming, and domain expertise. Their insights drive decisions in healthcare, finance, marketing, and virtually every industry today.',
        ],
      },
      {
        id: 'lesson_007',
        title: 'Data Collection and Cleaning',
        topic: 'Data Science Fundamentals',
        outline: 'Methods for gathering data and techniques for cleaning messy datasets',
        paragraphs: [
          'Data can be collected from many sources: <strong>databases</strong> and data warehouses, <strong>REST APIs</strong> and web services, <strong>web scraping</strong>, and <strong>surveys</strong>. Each source has different reliability and format considerations.',
          'Real-world data is messy. Common issues include <strong>missing values</strong> (impute or drop), <strong>duplicates</strong> (deduplicate rows), <strong>outliers</strong> (cap or investigate), and <strong>inconsistent formats</strong> (standardize dates, units, and naming conventions).',
          'Data scientists estimate spending 60–80% of their time on cleaning and preparation. Thorough cleaning is essential — models are only as good as the data they train on. The principle is "garbage in, garbage out."',
        ],
      },
      {
        id: 'lesson_008',
        title: 'Statistical Foundations',
        topic: 'Data Science Fundamentals',
        outline: 'Core statistical measures: mean, median, and standard deviation',
        paragraphs: [
          'The <strong>mean</strong> (average) is calculated as the sum of all values divided by the count. While intuitive, it is sensitive to outliers — a single extreme value can skew the mean significantly.',
          'The <strong>median</strong> is the middle value when data is sorted. It is robust to outliers and is preferred for skewed distributions like income data, where a few very high earners would distort the mean.',
          '<strong>Standard deviation</strong> (&sigma;) measures how spread out values are from the mean. A low standard deviation means data points cluster tightly around the mean; a high standard deviation indicates wide spread. Together, these measures give you a complete picture of your data\'s central tendency and variability.',
        ],
      },
      {
        id: 'lesson_009',
        title: 'Data Visualization',
        topic: 'Data Science Fundamentals',
        outline: 'Choosing the right chart types to communicate data insights effectively',
        paragraphs: [
          'Choosing the right chart type is crucial for communicating insights clearly. <strong>Bar charts</strong> are best for comparing categories (e.g., sales by region). <strong>Line charts</strong> show trends over time (e.g., monthly revenue growth).',
          '<strong>Pie charts</strong> display proportions of a whole (e.g., market share breakdown) but should be limited to 5–6 slices. <strong>Scatter plots</strong> reveal relationships and correlations between two variables (e.g., height vs. weight).',
          'Good visualizations follow Edward Tufte\'s principles: maximize the data-ink ratio, avoid chartjunk, and ensure every visual element serves a purpose. The best chart is the one that makes your audience say "I see it now" immediately.',
        ],
      },
      {
        id: 'lesson_010',
        title: 'Introduction to Machine Learning',
        topic: 'Data Science Fundamentals',
        outline: 'Overview of supervised, unsupervised, and reinforcement learning paradigms',
        paragraphs: [
          '<strong>Supervised learning</strong> trains on labeled data to make predictions. It includes <strong>classification</strong> (predicting categories like spam/not spam) and <strong>regression</strong> (predicting continuous values like house prices from square footage).',
          '<strong>Unsupervised learning</strong> finds hidden patterns in unlabeled data. Common techniques include <strong>clustering</strong> (grouping similar customers) and <strong>dimensionality reduction</strong> (simplifying data while preserving important structure).',
          '<strong>Reinforcement learning</strong> trains an agent through trial and error, rewarding desired behaviors. It powers game-playing AI, robotics, and recommendation systems. Each paradigm suits different problem types and data availability.',
        ],
      },
    ],
  },
  // ========================================
  // Course 3: Python Programming
  // ========================================
  {
    id: 'course_003',
    title: 'Python Programming',
    description:
      'Learn Python from the ground up. Master syntax, data structures, functions, OOP, and file handling through practical examples and exercises.',
    categoryId: 'cat_004',
    coverImage: 'https://placehold.co/800x450/059669/white?text=Python+Programming',
    language: 'english',
    studentCount: 256,
    rating: 4.7,
    lessons: [
      {
        id: 'lesson_011',
        title: 'Python Basics and Syntax',
        topic: 'Python Programming',
        outline: 'Variables, data types, control flow, and core Python syntax',
        paragraphs: [
          'Python is <strong>dynamically typed</strong> — you do not need to declare variable types. Core data types include <strong>int</strong>, <strong>float</strong>, <strong>str</strong>, <strong>bool</strong>, <strong>list</strong>, <strong>dict</strong>, <strong>tuple</strong>, and <strong>set</strong>. Use meaningful variable names for readability.',
          '<strong>Control flow</strong> uses <code>if / elif / else</code> for branching and <code>for / while</code> for loops. Python uses indentation (typically 4 spaces) instead of braces to define code blocks, making it highly readable.',
          'Python\'s philosophy emphasizes readability and simplicity. The Zen of Python (accessible via <code>import this</code>) includes guiding principles like "Simple is better than complex" and "There should be one obvious way to do it."',
        ],
      },
      {
        id: 'lesson_012',
        title: 'Data Structures',
        topic: 'Python Programming',
        outline: 'Python built-in data structures: lists, tuples, dictionaries, and sets',
        paragraphs: [
          '<strong>Lists</strong> are ordered, mutable collections: <code>fruits = ["apple", "banana", "cherry"]</code>. They support indexing, slicing, appending, and comprehension for concise creation.',
          '<strong>Tuples</strong> are ordered but immutable — once created, their elements cannot change: <code>point = (10, 20)</code>. Use them for fixed collections like coordinates. <strong>Dictionaries</strong> store key-value pairs: <code>person = {"name": "Alice", "age": 25}</code>.',
          '<strong>Sets</strong> store unique elements with no duplicates and support mathematical operations like union, intersection, and difference: <code>{1, 2, 3, 2}</code> becomes <code>{1, 2, 3}</code>. Choosing the right structure improves both performance and code clarity.',
        ],
      },
      {
        id: 'lesson_013',
        title: 'Functions and Modules',
        topic: 'Python Programming',
        outline: 'Defining functions, using lambda expressions, and importing modules',
        paragraphs: [
          'Define functions with the <code>def</code> keyword. Python supports <strong>default arguments</strong>, <strong>*args</strong> (variable positional), and <strong>**kwargs</strong> (variable keyword) for flexible function signatures. Always include a docstring to document behavior.',
          '<strong>Lambda functions</strong> are anonymous one-liners for simple operations: <code>square = lambda x: x ** 2</code>. They are commonly used with <code>map()</code>, <code>filter()</code>, and <code>sorted()</code> for concise data transformations.',
          '<strong>Modules</strong> let you organize code into reusable files. Use <code>import math</code> to import an entire module, or <code>from datetime import date</code> for specific items. The <code>pip</code> package manager installs third-party libraries from PyPI.',
        ],
      },
      {
        id: 'lesson_014',
        title: 'Object-Oriented Programming',
        topic: 'Python Programming',
        outline: 'Classes, objects, inheritance, and encapsulation in Python',
        paragraphs: [
          '<strong>Classes</strong> are blueprints for creating objects. A class defines attributes (data) and methods (behavior). For example, a <code>Dog</code> class might have attributes <code>name</code> and <code>breed</code>, and a method <code>bark()</code>.',
          '<strong>Inheritance</strong> lets you create specialized classes that extend a base class, reusing and overriding its behavior. For example, a <code>GuideDog</code> class could inherit from <code>Dog</code> and add navigation-specific methods.',
          '<strong>Encapsulation</strong> bundles data and methods together, controlling access through public and private conventions (prefix with <code>_</code> or <code>__</code>). This prevents unintended interference and makes code more maintainable and robust.',
        ],
      },
      {
        id: 'lesson_015',
        title: 'File I/O and Error Handling',
        topic: 'Python Programming',
        outline: 'Reading and writing files, and using try/except for graceful error handling',
        paragraphs: [
          'Use <code>open()</code> with a <strong>context manager</strong> (<code>with</code> statement) to read and write files safely — it automatically closes the file when done. Modes: <code>"r"</code> for reading, <code>"w"</code> for writing (overwrites), <code>"a"</code> for appending.',
          'Python uses <strong>try / except / else / finally</strong> blocks for error handling. Wrap code that might fail in <code>try</code>, handle specific exceptions in <code>except</code>, and use <code>finally</code> for cleanup that always runs (like closing connections).',
          'Handle specific exceptions (e.g., <code>FileNotFoundError</code>, <code>ValueError</code>) rather than catching all exceptions with a bare <code>except:</code>. This makes debugging easier and prevents hiding unexpected errors. Good error handling makes programs robust and user-friendly.',
        ],
      },
    ],
  },
  // ========================================
  // Course 4: Environmental Science
  // ========================================
  {
    id: 'course_004',
    title: 'Environmental Science',
    description:
      'Explore ecosystems, climate science, biodiversity, renewable energy, and environmental policy. Understand our planet and how to protect it.',
    categoryId: 'cat_002',
    coverImage: 'https://placehold.co/800x450/d97706/white?text=Environmental+Science',
    language: 'english',
    studentCount: 134,
    rating: 4.4,
    lessons: [
      {
        id: 'lesson_016',
        title: 'Introduction to Ecosystems',
        topic: 'Environmental Science',
        outline: 'Understanding ecosystems, food chains, and biodiversity',
        paragraphs: [
          'An <strong>ecosystem</strong> is a community of living organisms (plants, animals, microbes) interacting with their physical environment (soil, water, climate). Ecosystems range from a small pond to the entire biosphere.',
          '<strong>Food chains</strong> describe the flow of energy from producers (plants) through primary consumers (herbivores) to secondary and tertiary consumers (carnivores) and finally decomposers. Each transfer loses about 90% of energy as heat.',
          '<strong>Biodiversity</strong> — the variety of life at genetic, species, and ecosystem levels — provides resilience against environmental changes, supports ecosystem services like pollination and water purification, and holds potential for undiscovered medicines and materials.',
        ],
      },
      {
        id: 'lesson_017',
        title: 'Climate Change Science',
        topic: 'Environmental Science',
        outline: 'Greenhouse gases, evidence of climate change, and its impacts',
        paragraphs: [
          'The <strong>greenhouse effect</strong> occurs when gases like CO<sub>2</sub> (from fossil fuels and deforestation), CH<sub>4</sub> (methane from agriculture), and N<sub>2</sub>O trap heat in the atmosphere, raising global temperatures. This is a natural process amplified by human activity.',
          'Key evidence of climate change includes: global temperature up 1.1&deg;C since the pre-industrial era, sea levels rising 3.6mm per year, Arctic ice shrinking ~13% per decade, and increasing frequency of extreme weather events like hurricanes and droughts.',
          'Climate change threatens ecosystems through habitat loss, disrupts agriculture and water supplies, and endangers human settlements in coastal and drought-prone regions. Mitigation requires reducing emissions while adaptation prepares communities for unavoidable changes.',
        ],
      },
      {
        id: 'lesson_018',
        title: 'Biodiversity and Conservation',
        topic: 'Environmental Science',
        outline: 'Threat levels, conservation strategies, and species protection',
        paragraphs: [
          'The IUCN Red List classifies species by threat level: <strong>Vulnerable</strong> (high risk, e.g., Giant Panda), <strong>Endangered</strong> (very high risk, e.g., Blue Whale), and <strong>Critically Endangered</strong> (extremely high risk, e.g., Amur Leopard).',
          'Major conservation strategies include <strong>protected areas</strong> (national parks, marine sanctuaries), <strong>captive breeding programs</strong> (zoos and breeding centers), and <strong>legislation</strong> like the Endangered Species Act and CITES treaty.',
          'Biodiversity loss is driven by habitat destruction, climate change, pollution, overexploitation, and invasive species. Conservation requires a combination of legal protection, habitat restoration, sustainable practices, and community engagement.',
        ],
      },
      {
        id: 'lesson_019',
        title: 'Renewable Energy',
        topic: 'Environmental Science',
        outline: 'Solar, wind, hydropower, and geothermal energy sources',
        paragraphs: [
          '<strong>Solar energy</strong> converts sunlight into electricity using photovoltaic cells. It is the fastest-growing energy source globally, with costs dropping over 90% in the last decade, making it cost-competitive with fossil fuels in many regions.',
          '<strong>Wind energy</strong> uses turbines to capture kinetic energy from wind. Offshore wind farms can generate massive amounts of clean electricity. <strong>Hydropower</strong> harnesses flowing water and remains the largest source of renewable electricity worldwide.',
          '<strong>Geothermal energy</strong> taps heat from the Earth\'s core for consistent baseload power 24/7. The transition to renewables is accelerated by battery storage advances, smart grids, and declining costs — but challenges remain in grid integration and energy storage.',
        ],
      },
      {
        id: 'lesson_020',
        title: 'Environmental Policy',
        topic: 'Environmental Science',
        outline: 'International treaties, agreements, and principles of environmental governance',
        paragraphs: [
          'The <strong>Kyoto Protocol (1997)</strong> was the first international treaty to set legally binding emission reduction targets for developed nations. While imperfect in execution, it established the framework for global climate cooperation.',
          'The <strong>Paris Agreement (2015)</strong> aims to limit global warming to 1.5&deg;C above pre-industrial levels. Unlike Kyoto, it requires all nations — not just developed ones — to set Nationally Determined Contributions (NDCs) and regularly report progress.',
          'A core principle of environmental policy is "common but differentiated responsibilities" — all countries share the obligation to act, but developed nations (historically the largest emitters) bear greater responsibility. Effective policy combines regulation, carbon pricing, and incentives for innovation.',
        ],
      },
    ],
  },
  // ========================================
  // Course 5: Business Communication
  // ========================================
  {
    id: 'course_005',
    title: 'Business Communication',
    description:
      'Master professional communication skills including email writing, presentations, cross-team collaboration, negotiation, and report writing.',
    categoryId: 'cat_005',
    coverImage: 'https://placehold.co/800x450/059669/white?text=Business+Communication',
    language: 'english',
    studentCount: 238,
    rating: 4.8,
    lessons: [
      {
        id: 'lesson_021',
        title: 'Email Writing Fundamentals',
        topic: 'Business Communication',
        outline: 'Writing clear, professional emails with proper structure and tone',
        paragraphs: [
          'A professional email follows a clear structure: <strong>Subject line</strong> (specific and action-oriented, e.g., "Action Required: Q3 Budget Review — Due Friday"), <strong>greeting</strong>, <strong>concise body</strong>, <strong>clear call to action</strong>, and <strong>professional sign-off</strong>.',
          'Match your <strong>tone</strong> to the audience — formal for executives and external clients, conversational for close colleagues. Avoid common mistakes: vague subjects, walls of text, missing calls to action, and unnecessary "reply all" usage.',
          'Use bullet points and short paragraphs for scannability. Put the most important information first (bottom-line up front). Proofread every email before sending — typos and grammatical errors undermine your credibility.',
        ],
      },
      {
        id: 'lesson_022',
        title: 'Presentation Skills',
        topic: 'Business Communication',
        outline: 'Slide design principles and delivery techniques for effective presentations',
        paragraphs: [
          'Effective slide design follows key principles: <strong>one idea per slide</strong> (do not overcrowd), <strong>visuals over text</strong> (people remember images 65% better than words), <strong>consistent formatting</strong> (same fonts, colors, and layouts throughout), and <strong>limit text to 6 lines per slide</strong>.',
          'Delivery matters as much as content. Maintain <strong>eye contact</strong> with your audience, use <strong>open gestures</strong>, and move purposefully. Vary your <strong>pace, volume, and tone</strong> to maintain engagement and emphasize key points.',
          'Rehearse out loud at least three times before presenting. Practice with your slides, time yourself, and if possible, get feedback from a colleague. Preparation builds confidence and helps you handle unexpected questions smoothly.',
        ],
      },
      {
        id: 'lesson_023',
        title: 'Cross-Team Communication',
        topic: 'Business Communication',
        outline: 'Choosing the right tools and practices for effective cross-team collaboration',
        paragraphs: [
          'Different tools serve different purposes in cross-team communication. <strong>Slack/Teams</strong> for quick questions and updates; <strong>email</strong> for formal communication and records; <strong>video calls</strong> for brainstorming and complex topics; <strong>documentation</strong> for reference material and SOPs.',
          'When communicating across teams, always <strong>provide context</strong> — assume no prior knowledge. A developer explaining a technical issue to marketing should translate jargon into business impact. Over-communicating is better than under-communicating.',
          'Establish clear <strong>communication norms</strong>: expected response times, which channel to use for which type of message, and how to escalate blockers. Regular cross-team syncs and shared documentation (like wikis or Notion pages) keep everyone aligned.',
        ],
      },
      {
        id: 'lesson_024',
        title: 'Negotiation Skills',
        topic: 'Business Communication',
        outline: 'Preparation, active listening, and win-win negotiation frameworks',
        paragraphs: [
          '<strong>Preparation</strong> is the most important phase. Research the other party\'s interests and constraints. Define your <strong>BATNA</strong> (Best Alternative to a Negotiated Agreement) — your walk-away option. Knowing your limits prevents you from accepting bad deals.',
          '<strong>Active listening</strong> means listening to understand, not just to respond. Ask clarifying questions, paraphrase to confirm understanding, and pay attention to non-verbal cues. People are more willing to negotiate with someone who genuinely understands their position.',
          'Adopt a <strong>win-win mindset</strong> — seek solutions that create value for both parties rather than treating negotiation as a zero-sum game. The Harvard Negotiation Project teaches: separate people from the problem, focus on interests not positions, generate options for mutual gain, and use objective criteria.',
        ],
      },
      {
        id: 'lesson_025',
        title: 'Written Reports and Proposals',
        topic: 'Business Communication',
        outline: 'Structuring professional reports and persuasive business proposals',
        paragraphs: [
          'A well-structured report follows a standard format: <strong>Executive Summary</strong> (key findings and recommendations on one page), <strong>Introduction</strong> (context, objectives, and scope), and <strong>Methodology</strong> (how you gathered and analyzed data).',
          'The <strong>Findings</strong> section presents data with clear visualizations — charts, tables, and infographics that tell a story. Each finding should link back to the original objectives. Avoid raw data dumps; instead, highlight patterns, trends, and actionable insights.',
          'End with <strong>Conclusion and Recommendations</strong> — specific, actionable next steps with owners and timelines. In proposals, include a clear ask, expected outcomes, and ROI justification. Executive readers should be able to grasp the entire report from the summary alone.',
        ],
      },
    ],
  },
]

// ============================================================
// Main seed function
// ============================================================
async function main() {
  console.log('Seeding LMS database...\n')

  // Clean existing data (respect FK order)
  await db.notification.deleteMany()
  await db.comment.deleteMany()
  await db.note.deleteMany()
  await db.rating.deleteMany()
  await db.favorite.deleteMany()
  await db.progress.deleteMany()
  await db.enrollment.deleteMany()
  await db.slide.deleteMany()
  await db.lesson.deleteMany()
  await db.course.deleteMany()
  await db.category.deleteMany()
  await db.user.deleteMany()

  // ============================================
  // Create users (instructor + students)
  // ============================================
  const instructor = await db.user.create({
    data: {
      id: 'user_instructor_001',
      email: 'instructor@ecotech.com',
      password: await hashPassword('instructor123'),
      name: 'Dr. Sarah Chen',
      avatar: null,
      role: 'instructor',
      department: 'Faculty',
    },
  })
  console.log(`Created user: ${instructor.name}`)

  const student1 = await db.user.create({
    data: {
      id: 'user_student_001',
      email: 'alex.student@ecotech.com',
      password: await hashPassword('student123'),
      name: 'Alex Johnson',
      avatar: null,
      role: 'student',
      department: 'Computer Science',
    },
  })

  const student2 = await db.user.create({
    data: {
      id: 'user_student_002',
      email: 'maria.student@ecotech.com',
      password: await hashPassword('student123'),
      name: 'Maria Garcia',
      avatar: null,
      role: 'student',
      department: 'Data Science',
    },
  })
  console.log(`Created students: ${student1.name}, ${student2.name}`)

  // ============================================
  // Create categories
  // ============================================
  const categories = await Promise.all([
    db.category.create({ data: { id: 'cat_001', name: 'Subject Education', description: 'Core academic subjects and foundational knowledge', color: '#0d9488' } }),
    db.category.create({ data: { id: 'cat_002', name: 'Life Skills', description: 'Practical skills for everyday life', color: '#d97706' } }),
    db.category.create({ data: { id: 'cat_003', name: 'Business Knowledge', description: 'Business acumen and professional skills', color: '#e11d48' } }),
    db.category.create({ data: { id: 'cat_004', name: 'Technology', description: 'Technical skills and IT knowledge', color: '#7c3aed' } }),
    db.category.create({ data: { id: 'cat_005', name: 'Communication', description: 'Writing, speaking, and interpersonal skills', color: '#059669' } }),
    db.category.create({ data: { id: 'cat_006', name: 'Safety & Compliance', description: 'Workplace safety and regulatory compliance', color: '#dc2626' } }),
  ])
  console.log(`Created ${categories.length} categories`)

  // ============================================
  // Create courses with lessons and slides
  // ============================================
  for (const seed of courseSeeds) {
    await db.course.create({
      data: {
        id: seed.id,
        title: seed.title,
        description: seed.description,
        coverImage: seed.coverImage,
        rating: seed.rating,
        studentCount: seed.studentCount,
        status: 'published',
        language: seed.language,
        categoryId: seed.categoryId,
        creatorId: 'user_instructor_001',
        lessons: {
          create: seed.lessons.map((lesson, index) => ({
            id: lesson.id,
            title: lesson.title,
            order: index + 1,
            outlineJson: JSON.stringify({
              topic: lesson.topic,
              style: 'professional',
              slides: [
                {
                  title: lesson.title,
                  outline: lesson.outline,
                },
              ],
            }),
            slides: {
              create: [
                {
                  title: lesson.title,
                  htmlBody: makeSlideHtml(lesson.title, lesson.paragraphs),
                  status: 'READY',
                  order: 0,
                },
              ],
            },
          })),
        },
      },
    })
    console.log(`Created course: ${seed.title} (${seed.lessons.length} lessons)`)
  }

  // ============================================
  // Create enrollments with progress
  // ============================================
  await db.enrollment.create({
    data: {
      userId: student1.id,
      courseId: 'course_001',
      status: 'in_progress',
      progresses: {
        create: [
          { lessonId: 'lesson_001', completed: true, currentPage: 1 },
          { lessonId: 'lesson_002', completed: false, currentPage: 1 },
        ],
      },
    },
  })

  await db.enrollment.create({
    data: {
      userId: student1.id,
      courseId: 'course_003',
      status: 'completed',
      completedAt: new Date('2026-07-20'),
      progresses: {
        create: [
          { lessonId: 'lesson_011', completed: true, currentPage: 1 },
          { lessonId: 'lesson_012', completed: true, currentPage: 1 },
        ],
      },
    },
  })

  // Create some favorites
  await db.favorite.create({ data: { userId: student1.id, courseId: 'course_002' } })
  await db.favorite.create({ data: { userId: student1.id, courseId: 'course_005' } })

  // ============================================
  // Create additional demo users for comments
  // ============================================
  const demoUser2 = await db.user.create({
    data: { id: 'user_demo_002', email: 'sarah.trainer@company.com', password: await hashPassword('demo123'), name: 'Sarah Chen', avatar: null, role: 'instructor', department: 'Product' },
  })
  const demoUser3 = await db.user.create({
    data: { id: 'user_demo_003', email: 'mike.jones@company.com', password: await hashPassword('demo123'), name: 'Mike Jones', avatar: null, role: 'student', department: 'Engineering' },
  })
  console.log(`Created users: ${demoUser2.name}, ${demoUser3.name}`)

  // ============================================
  // Create comments for discussion
  // ============================================
  await db.comment.create({
    data: {
      id: 'comment_001',
      content: 'This section on logical fallacies was incredibly helpful! I never realized how often I encounter ad hominem arguments in meetings. Can anyone recommend additional resources on identifying cognitive biases?',
      courseId: 'course_001',
      lessonId: 'lesson_004',
      userId: student1.id,
      createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    },
  })
  await db.comment.create({
    data: {
      id: 'comment_002',
      content: "Great question, Alex! I'd recommend Daniel Kahneman's 'Thinking, Fast and Slow' \u2014 it covers cognitive biases in depth and is very accessible.",
      courseId: 'course_001',
      lessonId: 'lesson_004',
      userId: 'user_demo_002',
      parentId: 'comment_001',
      createdAt: new Date(Date.now() - 1 * 60 * 60 * 1000),
    },
  })
  await db.comment.create({
    data: {
      id: 'comment_003',
      content: 'The email templates in this course saved me so much time. I\'ve already started using the meeting request template and my colleagues noticed the improvement!',
      courseId: 'course_005',
      lessonId: 'lesson_021',
      userId: 'user_demo_003',
      createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    },
  })
  await db.comment.create({
    data: {
      id: 'comment_004',
      content: 'Is there a follow-up course that covers more advanced communication topics like cross-cultural communication?',
      courseId: 'course_005',
      userId: student1.id,
      createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
    },
  })
  await db.comment.create({
    data: {
      id: 'comment_005',
      content: 'The Polya method section was eye-opening. I\'ve been using it at work to break down complex engineering problems. Highly recommended for anyone in a technical role.',
      courseId: 'course_001',
      lessonId: 'lesson_005',
      userId: 'user_demo_003',
      createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
    },
  })
  await db.comment.create({
    data: {
      id: 'comment_006',
      content: "I agree! The 'Look Back' step is something most people skip but it really helps solidify understanding.",
      courseId: 'course_001',
      lessonId: 'lesson_005',
      userId: 'user_demo_002',
      parentId: 'comment_005',
      createdAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
    },
  })
  await db.comment.create({
    data: {
      id: 'comment_007',
      content: 'The Python Programming course was very practical. I wish we had this training when I first joined the company. The data structures section alone is worth the time.',
      courseId: 'course_003',
      userId: 'user_demo_002',
      createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    },
  })
  await db.comment.create({
    data: {
      id: 'comment_008',
      content: 'The quiz at the end of each section really helps reinforce the concepts. I found myself going back to review content I thought I already understood.',
      courseId: 'course_001',
      userId: student1.id,
      createdAt: new Date(Date.now() - 6 * 60 * 60 * 1000),
    },
  })
  console.log('Created 8 comments (including 2 replies)')

  // ============================================
  // Create notifications for demo user
  // ============================================
  const now = new Date()
  await db.notification.createMany({
    data: [
      {
        id: 'notif_001',
        userId: student1.id,
        title: 'New Course Available',
        message: 'Python Programming has been published. Check it out!',
        type: 'course',
        read: false,
        link: 'course-detail:course_003',
        createdAt: new Date(now.getTime() - 15 * 60 * 1000),
      },
      {
        id: 'notif_002',
        userId: student1.id,
        title: 'Achievement Unlocked!',
        message: 'You completed your first course. Keep up the great work!',
        type: 'achievement',
        read: false,
        link: null,
        createdAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
      },
      {
        id: 'notif_003',
        userId: student1.id,
        title: 'Enrollment Confirmed',
        message: 'You are now enrolled in Mathematical Thinking.',
        type: 'success',
        read: false,
        link: 'course-detail:course_001',
        createdAt: new Date(now.getTime() - 5 * 60 * 60 * 1000),
      },
      {
        id: 'notif_004',
        userId: student1.id,
        title: 'Weekly Learning Reminder',
        message: "You haven't started a course this week. Keep your learning streak going!",
        type: 'warning',
        read: false,
        link: null,
        createdAt: new Date(now.getTime() - 24 * 60 * 60 * 1000),
      },
      {
        id: 'notif_005',
        userId: instructor.id,
        title: 'New Student Enrolled',
        message: 'Alex Johnson enrolled in your course Mathematical Thinking.',
        type: 'course',
        read: true,
        link: 'course-detail:course_001',
        createdAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000),
      },
      {
        id: 'notif_006',
        userId: instructor.id,
        title: 'System Update',
        message: 'Platform v1.0 is now live with new features and improvements.',
        type: 'system',
        read: true,
        link: null,
        createdAt: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000),
      },
      {
        id: 'notif_007',
        userId: student2.id,
        title: 'Streak Milestone',
        message: "Congratulations! You've maintained a 7-day learning streak.",
        type: 'achievement',
        read: false,
        link: 'profile',
        createdAt: new Date(now.getTime() - 8 * 60 * 60 * 1000),
      },
      {
        id: 'notif_008',
        userId: instructor.id,
        title: 'New Reply to Student Question',
        message: 'Sarah Chen replied to Alex\'s question in Mathematical Thinking.',
        type: 'info',
        read: true,
        link: 'course-detail:course_001',
        createdAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
      },
    ],
  })
  console.log('Created 8 sample notifications')

  // ============================================
  // Summary
  // ============================================
  const totalLessons = courseSeeds.reduce((sum, c) => sum + c.lessons.length, 0)
  console.log('\nSeed completed successfully!')
  console.log(`   - 5 users, ${categories.length} categories, ${courseSeeds.length} courses, ${totalLessons} lessons, ${totalLessons} slides`)
  console.log('   - 2 enrollments, 2 favorites, 8 comments, 8 notifications created\n')
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect())
