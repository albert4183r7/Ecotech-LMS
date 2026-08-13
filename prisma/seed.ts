import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding LMS database...\n");

  // Clean existing data
  await prisma.comment.deleteMany();
  await prisma.favorite.deleteMany();
  await prisma.progress.deleteMany();
  await prisma.enrollment.deleteMany();
  await prisma.section.deleteMany();
  await prisma.course.deleteMany();
  await prisma.category.deleteMany();
  await prisma.user.deleteMany();

  // ============================================
  // Create demo user
  // ============================================
  const user = await prisma.user.create({
    data: {
      id: "user_demo_001",
      email: "john.employee@company.com",
      name: "John Employee",
      avatar: null,
      role: "employee",
      department: "Engineering",
    },
  });
  console.log(`👤 Created user: ${user.name}`);

  // ============================================
  // Create categories
  // ============================================
  const categories = await Promise.all([
    prisma.category.create({
      data: {
        id: "cat_001",
        name: "Subject Education",
        description: "Core academic subjects and foundational knowledge",
        color: "#0891b2"
      }
    }),
    prisma.category.create({
      data: {
        id: "cat_002",
        name: "Life Skills",
        description: "Practical skills for everyday life",
        color: "#0d9488"
      }
    }),
    prisma.category.create({
      data: {
        id: "cat_003",
        name: "Business Knowledge",
        description: "Business acumen and professional skills",
        color: "#2563eb"
      }
    }),
    prisma.category.create({
      data: {
        id: "cat_004",
        name: "Technology",
        description: "Technical skills and IT knowledge",
        color: "#7c3aed"
      }
    }),
    prisma.category.create({
      data: {
        id: "cat_005",
        name: "Communication",
        description: "Writing, speaking, and interpersonal skills",
        color: "#059669"
      }
    }),
    prisma.category.create({
      data: {
        id: "cat_006",
        name: "Safety & Compliance",
        description: "Workplace safety and regulatory compliance",
        color: "#dc2626"
      }
    }),
  ]);
  console.log(`📂 Created ${categories.length} categories`);

  // ============================================
  // Helper: create course with sections
  // ============================================
  const courseSeeds: Array<{
    id: string;
    title: string;
    description: string;
    categoryId: string;
    coverImage: string;
    language: string;
    studentCount: number;
    rating: number;
    sections: { id: string; title: string; totalPages: number; content: string }[];
  }> = [
    {
      id: "course_001",
      title: "Mathematical Thinking",
      description: "Develop logical reasoning and problem-solving skills through mathematical concepts. Learn to approach complex problems systematically and build strong analytical foundations.",
      categoryId: "cat_001",
      coverImage: "https://placehold.co/800x450/0891b2/white?text=Mathematical+Thinking",
      language: "english",
      studentCount: 142,
      rating: 4.5,
      sections: [
        {
          id: "sec_001",
          title: "Introduction to Logical Reasoning",
          totalPages: 7,
          content: JSON.stringify([
            { title: "Introduction to Logical Reasoning", type: "title", subtitle: "Building the foundation for mathematical thinking" },
            { title: "What is Logical Reasoning?", type: "content", items: [
              { heading: "Definition", text: "Logical reasoning is the process of using rational, systematic steps to arrive at a valid conclusion." },
              { heading: "Core Principles", text: "Inductive reasoning, deductive reasoning, and abductive reasoning form the three pillars." },
              { heading: "Real-World Application", text: "From debugging code to making business decisions, logical thinking is essential." }
            ]},
            { title: "Types of Logical Reasoning", type: "list", items: [
              { text: "Deductive Reasoning - From general to specific (Top-down)" },
              { text: "Inductive Reasoning - From specific to general (Bottom-up)" },
              { text: "Abductive Reasoning - Inference to the best explanation" }
            ]},
            { title: "Common Logical Fallacies", type: "table", tableData: { headers: ["Fallacy", "Description", "Example"], rows: [["Ad Hominem", "Attacking the person, not the argument", "\"You can't trust his math skills, he's a musician\""], ["Straw Man", "Misrepresenting the argument", "Oversimplifying an opponent's position"], ["Circular Reasoning", "Begging the question", "\"X is true because X is true\""]] } },
            { title: "Practice Exercise", type: "quiz", items: [{ text: "Identify the type of reasoning: 'All birds have feathers. A robin is a bird. Therefore, a robin has feathers.'" }] },
            { title: "Logical Reasoning in Technology", type: "content", items: [
              { heading: "Algorithm Design", text: "Breaking down complex problems into step-by-step procedures." },
              { heading: "Debugging", text: "Systematically tracing code to find and fix errors." },
              { heading: "System Architecture", text: "Designing scalable and maintainable software systems." }
            ]},
            { title: "Key Takeaways", type: "list", items: [
              { text: "Logical reasoning is a skill that improves with practice" },
              { text: "Understanding fallacies helps avoid common thinking traps" },
              { text: "Apply structured thinking to both technical and everyday problems" }
            ]}
          ]),
        },
        {
          id: "sec_002",
          title: "Patterns and Sequences",
          totalPages: 5,
          content: JSON.stringify([
            { title: "Patterns and Sequences", type: "title", subtitle: "Recognizing and creating mathematical patterns" },
            { title: "Arithmetic Sequences", type: "content", items: [{ heading: "Definition", text: "A sequence where each term differs from the previous by a constant difference." }, { heading: "Formula", text: "aₙ = a₁ + (n-1)d where d is the common difference." }] },
            { title: "Geometric Sequences", type: "content", items: [{ heading: "Definition", text: "A sequence where each term is multiplied by a constant ratio." }, { heading: "Formula", text: "aₙ = a₁ × r⁽ⁿ⁻¹⁾ where r is the common ratio." }] },
            { title: "Fibonacci Sequence", type: "content", items: [{ heading: "The Golden Pattern", text: "1, 1, 2, 3, 5, 8, 13, 21... Each number is the sum of the two before it." }, { heading: "Nature Connection", text: "Found in sunflower spirals, shell curves, and branching patterns." }] },
            { title: "Key Takeaways", type: "list", items: [{ text: "Patterns are everywhere in nature and mathematics" }, { text: "Sequences follow predictable rules that can be described mathematically" }] }
          ]),
        },
        {
          id: "sec_003",
          title: "Problem Solving Strategies",
          totalPages: 4,
          content: JSON.stringify([
            { title: "Problem Solving Strategies", type: "title", subtitle: "Systematic approaches to tackle complex problems" },
            { title: "Polya's Four-Step Method", type: "list", items: [{ text: "1. Understand the Problem - Read carefully, identify what's given and what's asked" }, { text: "2. Devise a Plan - Choose a strategy (draw diagram, find pattern, work backwards)" }, { text: "3. Carry out the Plan - Execute your chosen strategy step by step" }, { text: "4. Look Back - Verify your answer and consider alternative solutions" }] },
            { title: "Common Strategies", type: "content", items: [{ heading: "Draw a Diagram", text: "Visual representations make abstract problems concrete." }, { heading: "Look for Patterns", text: "Identify repeating structures that simplify the problem." }] },
            { title: "Summary", type: "list", items: [{ text: "Good problem solvers are made, not born" }, { text: "Practice with diverse problems builds flexibility" }] }
          ]),
        },
      ],
    },
    {
      id: "course_002",
      title: "Effective Business Communication",
      description: "Master the art of professional communication in the workplace. Learn to write clear emails, deliver impactful presentations, and communicate effectively with teams.",
      categoryId: "cat_005",
      coverImage: "https://placehold.co/800x450/0d9488/white?text=Business+Communication",
      language: "english",
      studentCount: 238,
      rating: 4.8,
      sections: [
        {
          id: "sec_004",
          title: "Email Writing Fundamentals",
          totalPages: 5,
          content: JSON.stringify([
            { title: "Email Writing Fundamentals", type: "title", subtitle: "Writing clear, professional emails" },
            { title: "The Anatomy of a Professional Email", type: "content", items: [{ heading: "Subject Line", text: "Clear, specific, and actionable. Example: 'Action Required: Q3 Budget Review - Due Friday'" }, { heading: "Opening", text: "Professional greeting tailored to the recipient." }, { heading: "Body", text: "Concise, well-structured paragraphs with a clear call to action." }] },
            { title: "Common Email Mistakes", type: "table", tableData: { headers: ["Mistake", "Impact", "Fix"], rows: [["Vague subject line", "Email gets lost or ignored", "Use specific, action-oriented subjects"], ["Wall of text", "Reader skims and misses key points", "Use bullet points and short paragraphs"], ["No call to action", "Recipient unsure what to do", "End with clear next steps"]] } },
            { title: "Email Templates", type: "content", items: [{ heading: "Meeting Request", text: "State purpose, proposed time, and agenda." }, { heading: "Status Update", text: "Lead with progress, flag blockers." }] },
            { title: "Best Practices Summary", type: "list", items: [{ text: "Proofread before sending" }, { text: "Keep emails under 200 words when possible" }, { text: "Reply within 24 hours" }] }
          ]),
        },
        {
          id: "sec_005",
          title: "Presentation Skills",
          totalPages: 6,
          content: JSON.stringify([
            { title: "Presentation Skills", type: "title", subtitle: "Delivering impactful presentations" },
            { title: "Planning Your Presentation", type: "content", items: [{ heading: "Know Your Audience", text: "Tailor your content, tone, and examples to who you're presenting to." }, { heading: "Define Clear Objectives", text: "What should the audience know or do after your presentation?" }] },
            { title: "Slide Design Principles", type: "list", items: [{ text: "One idea per slide - Don't overcrowd" }, { text: "Use visuals over text - People remember images better" }, { text: "Consistent formatting - Same fonts, colors, and layouts" }, { text: "Limit text to 6 lines per slide" }] },
            { title: "Delivery Techniques", type: "content", items: [{ heading: "Body Language", text: "Maintain eye contact, use open gestures, and move purposefully." }, { heading: "Voice", text: "Vary your pace, volume, and tone to maintain engagement." }] },
            { title: "Handling Q&A", type: "content", items: [{ heading: "Listen Fully", text: "Let the questioner finish before responding." }, { heading: "Bridge Techniques", text: "Connect questions back to your key messages." }] },
            { title: "Key Takeaways", type: "list", items: [{ text: "Preparation is 80% of a great presentation" }, { text: "Practice out loud at least 3 times" }] }
          ]),
        },
        {
          id: "sec_006",
          title: "Cross-Team Communication",
          totalPages: 4,
          content: JSON.stringify([
            { title: "Cross-Team Communication", type: "title", subtitle: "Collaborating across departments" },
            { title: "Bridging the Gap", type: "content", items: [{ heading: "Shared Vocabulary", text: "Establish common terms to avoid misunderstandings across teams." }, { heading: "Regular Sync", text: "Schedule brief check-ins to maintain alignment." }] },
            { title: "Communication Tools", type: "table", tableData: { headers: ["Tool Type", "Best For", "Avoid Using For"], rows: [["Slack/Teams", "Quick questions, updates", "Complex discussions, decisions"], ["Email", "Formal communication, records", "Urgent matters"], ["Video Call", "Brainstorming, complex topics", "Quick status updates"], ["Documentation", "Reference material, SOPs", "Time-sensitive communication"]] } },
            { title: "Summary", type: "list", items: [{ text: "Context is king - always provide enough background" }, { text: "Over-communicate rather than under-communicate" }] }
          ]),
        },
      ],
    },
    {
      id: "course_003",
      title: "Workplace Safety Essentials",
      description: "Comprehensive guide to workplace safety protocols, emergency procedures, and hazard prevention. Required training for all employees.",
      categoryId: "cat_006",
      coverImage: "https://placehold.co/800x450/dc2626/white?text=Workplace+Safety",
      language: "english",
      studentCount: 456,
      rating: 4.2,
      sections: [
        {
          id: "sec_007",
          title: "Emergency Procedures",
          totalPages: 5,
          content: JSON.stringify([
            { title: "Emergency Procedures", type: "title", subtitle: "Know what to do in an emergency" },
            { title: "Fire Safety", type: "content", items: [{ heading: "R.A.C.E Protocol", text: "Rescue, Alarm, Contain, Extinguish/Evacuate." }, { heading: "Evacuation Routes", text: "Know at least two exit routes from your work area." }] },
            { title: "First Aid Basics", type: "content", items: [{ heading: "ABCs of First Aid", text: "Airway, Breathing, Circulation - Check these first." }, { heading: "AED Usage", text: "Turn on, follow voice prompts, apply pads as shown." }] },
            { title: "Emergency Contacts", type: "table", tableData: { headers: ["Emergency Type", "Contact", "Extension"], rows: [["Medical Emergency", "Company Nurse Station", "x5001"], ["Fire/Police", "911", ""], ["Building Security", "Security Office", "x5000"], ["HR Incident Report", "HR Department", "x3001"]] } },
            { title: "Remember", type: "list", items: [{ text: "Stay calm and follow established protocols" }, { text: "Report all incidents, even near-misses" }] }
          ]),
        },
        {
          id: "sec_008",
          title: "Ergonomics and Injury Prevention",
          totalPages: 4,
          content: JSON.stringify([
            { title: "Ergonomics and Injury Prevention", type: "title", subtitle: "Setting up your workspace for health" },
            { title: "Proper Desk Setup", type: "list", items: [{ text: "Monitor at eye level, arm's length away" }, { text: "Chair supports lower back, feet flat on floor" }, { text: "Keyboard at elbow height, wrists straight" }, { text: "Take breaks every 30 minutes - Use the 20-20-20 rule" }] },
            { title: "Common Workplace Injuries", type: "table", tableData: { headers: ["Injury Type", "Cause", "Prevention"], rows: [["RSI (Repetitive Strain)", "Repetitive typing/mouse use", "Ergonomic setup, stretches, breaks"], ["Back Pain", "Poor posture, heavy lifting", "Proper lifting technique, core strength"], ["Eye Strain", "Extended screen time", "20-20-20 rule, proper lighting"]] } },
            { title: "Key Takeaways", type: "list", items: [{ text: "Your health is the company's priority" }, { text: "Report discomfort early - don't wait for injury" }] }
          ]),
        },
      ],
    },
    {
      id: "course_004",
      title: "Introduction to Data Analytics",
      description: "Learn the fundamentals of data analytics, including data collection, cleaning, visualization, and basic statistical analysis. Perfect for beginners.",
      categoryId: "cat_004",
      coverImage: "https://placehold.co/800x450/7c3aed/white?text=Data+Analytics",
      language: "english",
      studentCount: 189,
      rating: 4.6,
      sections: [
        {
          id: "sec_009",
          title: "What is Data Analytics?",
          totalPages: 6,
          content: JSON.stringify([
            { title: "What is Data Analytics?", type: "title", subtitle: "Understanding the power of data-driven decisions" },
            { title: "The Data Analytics Process", type: "content", items: [{ heading: "Collect", text: "Gathering data from various sources - databases, APIs, surveys." }, { heading: "Clean", text: "Removing errors, duplicates, and inconsistencies." }, { heading: "Analyze", text: "Applying statistical methods and algorithms." }, { heading: "Visualize", text: "Creating charts and dashboards for insights." }] },
            { title: "Types of Analytics", type: "list", items: [{ text: "Descriptive Analytics - What happened?" }, { text: "Diagnostic Analytics - Why did it happen?" }, { text: "Predictive Analytics - What will happen?" }, { text: "Prescriptive Analytics - What should we do?" }] },
            { title: "Common Tools", type: "table", tableData: { headers: ["Tool", "Purpose", "Skill Level"], rows: [["Excel/Google Sheets", "Basic analysis and pivots", "Beginner"], ["SQL", "Data querying and manipulation", "Beginner"], ["Python/R", "Advanced analysis and modeling", "Intermediate"], ["Tableau/Power BI", "Data visualization", "Intermediate"]] } },
            { title: "Data Quality Matters", type: "content", items: [{ heading: "Garbage In, Garbage Out", text: "The quality of your analysis depends entirely on data quality." }, { heading: "Data Validation", text: "Always verify source, accuracy, and completeness." }] },
            { title: "Key Takeaways", type: "list", items: [{ text: "Data analytics transforms raw data into actionable insights" }, { text: "Start with the right question before diving into data" }] }
          ]),
        },
        {
          id: "sec_010",
          title: "Data Visualization Basics",
          totalPages: 5,
          content: JSON.stringify([
            { title: "Data Visualization Basics", type: "title", subtitle: "Making data tell a story" },
            { title: "Choosing the Right Chart", type: "table", tableData: { headers: ["Chart Type", "Best For", "Example Use"], rows: [["Bar Chart", "Comparing categories", "Sales by region"], ["Line Chart", "Showing trends over time", "Monthly revenue"], ["Pie Chart", "Showing proportions", "Market share breakdown"], ["Scatter Plot", "Showing relationships", "Correlation analysis"]] } },
            { title: "Design Principles", type: "list", items: [{ text: "Keep it simple - Remove unnecessary elements" }, { text: "Use color purposefully - Highlight key data points" }, { text: "Label clearly - Every axis and legend should be self-explanatory" }, { text: "Tell a story - Guide the viewer's eye to the insight" }] },
            { title: "Common Visualization Mistakes", type: "content", items: [{ heading: "Truncated Y-Axis", text: "Starting the Y-axis above zero exaggerates differences." }, { heading: "3D Charts", text: "They distort perception and are hard to read." }] },
            { title: "Summary", type: "list", items: [{ text: "Good visualization makes complex data accessible to everyone" }, { text: "Always consider your audience when designing charts" }] }
          ]),
        },
      ],
    },
    {
      id: "course_005",
      title: "Healthy Diet & Nutrition",
      description: "Learn the fundamentals of balanced nutrition, meal planning, and healthy eating habits that boost productivity and well-being.",
      categoryId: "cat_002",
      coverImage: "https://placehold.co/800x450/059669/white?text=Healthy+Nutrition",
      language: "english",
      studentCount: 97,
      rating: 4.3,
      sections: [
        {
          id: "sec_011",
          title: "Understanding Macronutrients",
          totalPages: 5,
          content: JSON.stringify([
            { title: "Understanding Macronutrients", type: "title", subtitle: "The building blocks of a healthy diet" },
            { title: "The Three Macronutrients", type: "table", tableData: { headers: ["Macronutrient", "Function", "Healthy Sources", "% of Daily Calories"], rows: [["Protein", "Builds and repairs tissue", "Lean meat, fish, eggs, legumes", "10-35%"], ["Carbohydrates", "Primary energy source", "Whole grains, fruits, vegetables", "45-65%"], ["Fats", "Hormone production, brain health", "Nuts, avocado, olive oil, fish", "20-35%"]] } },
            { title: "Protein Essentials", type: "content", items: [{ heading: "Daily Needs", text: "0.8g per kg body weight for sedentary adults." }, { heading: "Complete vs Incomplete", text: "Animal proteins are complete; combine plant sources for complete amino acid profiles." }] },
            { title: "Smart Carbs", type: "content", items: [{ heading: "Complex Carbs", text: "Oats, brown rice, sweet potatoes - provide sustained energy." }, { heading: "Simple Carbs", text: "Sugar, white bread - quick energy spike followed by crash." }] },
            { title: "Key Takeaways", type: "list", items: [{ text: "Balance is key - no single macronutrient should dominate" }, { text: "Whole foods > processed foods" }] }
          ]),
        },
      ],
    },
    {
      id: "course_006",
      title: "Basic Economics for Professionals",
      description: "Understanding fundamental economic principles that affect business decisions, market dynamics, and financial literacy.",
      categoryId: "cat_003",
      coverImage: "https://placehold.co/800x450/2563eb/white?text=Basic+Economics",
      language: "english",
      studentCount: 164,
      rating: 4.1,
      sections: [
        {
          id: "sec_012",
          title: "Supply and Demand",
          totalPages: 5,
          content: JSON.stringify([
            { title: "Supply and Demand", type: "title", subtitle: "The fundamental forces of every market" },
            { title: "The Law of Demand", type: "content", items: [{ heading: "Principle", text: "As price increases, quantity demanded decreases (and vice versa)." }, { heading: "Demand Curve", text: "A downward-sloping curve showing price-quantity relationship." }] },
            { title: "The Law of Supply", type: "content", items: [{ heading: "Principle", text: "As price increases, quantity supplied increases." }, { heading: "Supply Curve", text: "An upward-sloping curve showing producer behavior." }] },
            { title: "Market Equilibrium", type: "content", items: [{ heading: "Where Supply Meets Demand", text: "The point where quantity supplied equals quantity demanded." }, { heading: "Price Signals", text: "Prices communicate information about scarcity and value." }] },
            { title: "Key Takeaways", type: "list", items: [{ text: "Supply and demand affects every business decision" }, { text: "Understanding market forces helps in strategic planning" }] }
          ]),
        },
      ],
    },
    {
      id: "course_007",
      title: "Guitar Basics for Beginners",
      description: "Start your musical journey with guitar fundamentals. Learn chords, strumming patterns, and your first songs.",
      categoryId: "cat_002",
      coverImage: "https://placehold.co/800x450/ea580c/white?text=Guitar+Basics",
      language: "english",
      studentCount: 78,
      rating: 4.7,
      sections: [
        {
          id: "sec_013",
          title: "Parts of the Guitar",
          totalPages: 3,
          content: JSON.stringify([
            { title: "Parts of the Guitar", type: "title", subtitle: "Getting to know your instrument" },
            { title: "Anatomy of a Guitar", type: "content", items: [{ heading: "Headstock", text: "Houses the tuning pegs." }, { heading: "Neck & Fretboard", text: "Where you press strings to create notes." }, { heading: "Body", text: "The sound-producing chamber." }] },
            { title: "Summary", type: "list", items: [{ text: "Understanding your guitar's parts is the first step to playing" }] }
          ]),
        },
      ],
    },
    {
      id: "course_008",
      title: "Fiber Optic Construction",
      description: "Comprehensive training on fiber optic cable installation, splicing, and testing for telecommunications infrastructure.",
      categoryId: "cat_004",
      coverImage: "https://placehold.co/800x450/0f766e/white?text=Fiber+Optics",
      language: "chinese",
      studentCount: 53,
      rating: 4.4,
      sections: [
        {
          id: "sec_014",
          title: "光纤基础知识",
          totalPages: 4,
          content: JSON.stringify([
            { title: "光纤基础知识", type: "title", subtitle: "了解光纤通信的原理和结构" },
            { title: "光纤的结构", type: "content", items: [{ heading: "纤芯", text: "光信号传输的核心部分。" }, { heading: "包层", text: "包裹纤芯，使光在纤芯中全反射传输。" }] },
            { title: "光纤类型", type: "table", tableData: { headers: ["类型", "特点", "应用"], rows: [["单模光纤", "芯径小，传输距离远", "长途通信，海底光缆"], ["多模光纤", "芯径大，成本低", "短距离通信，局域网"]] } },
            { title: "总结", type: "list", items: [{ text: "光纤是现代通信的基础" }, { text: "理解基本原理是施工的第一步" }] }
          ]),
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
        creatorId: "user_demo_001",
        sections: {
          create: seed.sections.map((sec, index) => ({
            id: sec.id,
            title: sec.title,
            content: sec.content,
            totalPages: sec.totalPages,
            order: index + 1,
          })),
        },
      },
    });
    console.log(`📚 Created course: ${seed.title}`);
  }

  // ============================================
  // Create some enrollments for the demo user
  // ============================================
  await prisma.enrollment.create({
    data: {
      userId: "user_demo_001",
      courseId: "course_001",
      status: "in_progress",
      progresses: {
        create: [
          { sectionId: "sec_001", completed: true, currentPage: 7 },
          { sectionId: "sec_002", completed: false, currentPage: 3 },
        ],
      },
    },
  });

  await prisma.enrollment.create({
    data: {
      userId: "user_demo_001",
      courseId: "course_003",
      status: "completed",
      completedAt: new Date("2026-07-20"),
      progresses: {
        create: [
          { sectionId: "sec_007", completed: true, currentPage: 5 },
          { sectionId: "sec_008", completed: true, currentPage: 4 },
        ],
      },
    },
  });

  // Create some favorites
  await prisma.favorite.create({
    data: {
      userId: "user_demo_001",
      courseId: "course_004",
    },
  });

  await prisma.favorite.create({
    data: {
      userId: "user_demo_001",
      courseId: "course_002",
    },
  });

  // ============================================
  // Create additional demo users for comments
  // ============================================
  const user2 = await prisma.user.create({
    data: {
      id: "user_demo_002",
      email: "sarah.trainer@company.com",
      name: "Sarah Chen",
      avatar: null,
      role: "instructor",
      department: "Product",
    },
  });
  const user3 = await prisma.user.create({
    data: {
      id: "user_demo_003",
      email: "mike.jones@company.com",
      name: "Mike Jones",
      avatar: null,
      role: "employee",
      department: "Engineering",
    },
  });
  console.log(`👤 Created users: ${user2.name}, ${user3.name}`);

  // ============================================
  // Create some comments for discussion
  // ============================================
  const comment1 = await prisma.comment.create({
    data: {
      id: "comment_001",
      content: "This section on logical fallacies was incredibly helpful! I never realized how often I encounter ad hominem arguments in meetings. Can anyone recommend additional resources on identifying cognitive biases?",
      courseId: "course_001",
      sectionId: "sec_001",
      userId: "user_demo_001",
      createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    },
  });
  await prisma.comment.create({
    data: {
      id: "comment_002",
      content: "Great question, John! I'd recommend Daniel Kahneman's 'Thinking, Fast and Slow' — it covers cognitive biases in depth and is very accessible.",
      courseId: "course_001",
      sectionId: "sec_001",
      userId: "user_demo_002",
      parentId: "comment_001",
      createdAt: new Date(Date.now() - 1 * 60 * 60 * 1000),
    },
  });
  await prisma.comment.create({
    data: {
      id: "comment_003",
      content: "The email templates in this course saved me so much time. I've already started using the meeting request template and my colleagues noticed the improvement!",
      courseId: "course_002",
      sectionId: "sec_004",
      userId: "user_demo_003",
      createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    },
  });
  await prisma.comment.create({
    data: {
      id: "comment_004",
      content: "Is there a follow-up course that covers more advanced communication topics like cross-cultural communication?",
      courseId: "course_002",
      userId: "user_demo_001",
      createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
    },
  });
  await prisma.comment.create({
    data: {
      id: "comment_005",
      content: "The Polya method section was eye-opening. I've been using it at work to break down complex engineering problems. Highly recommended for anyone in a technical role.",
      courseId: "course_001",
      sectionId: "sec_003",
      userId: "user_demo_003",
      createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
    },
  });
  await prisma.comment.create({
    data: {
      id: "comment_006",
      content: "I agree! The 'Look Back' step is something most people skip but it really helps solidify understanding.",
      courseId: "course_001",
      sectionId: "sec_003",
      userId: "user_demo_002",
      parentId: "comment_005",
      createdAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
    },
  });
  await prisma.comment.create({
    data: {
      id: "comment_007",
      content: "The financial literacy course was very practical. I wish we had this training when I first joined the company. The budgeting section alone is worth the time.",
      courseId: "course_003",
      userId: "user_demo_002",
      createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    },
  });
  await prisma.comment.create({
    data: {
      id: "comment_008",
      content: "The quiz at the end of each section really helps reinforce the concepts. I found myself going back to review slides I thought I already understood.",
      courseId: "course_001",
      userId: "user_demo_001",
      createdAt: new Date(Date.now() - 6 * 60 * 60 * 1000),
    },
  });
  console.log("💬 Created 8 comments (including 2 replies)");

  console.log("\n✅ Seed completed successfully!");
  console.log(`   - 3 users, ${categories.length} categories, ${courseSeeds.length} courses`);
  console.log(`   - 2 enrollments, 2 favorites, 8 comments created\n`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
