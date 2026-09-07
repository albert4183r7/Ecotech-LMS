import { chromium } from "playwright";
import path from "node:path";

const output = path.resolve("C:/Users/Lenovo/.codex/visualizations/2026/09/07/01a079b1-27e6-7bd0-bca2-44659ea67372");
const browser = await chromium.launch({ headless: true });

async function login(context, email, password) {
  const response = await context.request.post("http://127.0.0.1:3000/api/auth/login", {
    data: { email, password },
  });
  if (!response.ok()) throw new Error(`Login failed for ${email}: ${response.status()}`);
  const setCookie = response.headers()["set-cookie"];
  if (setCookie) {
    const [pair] = setCookie.split(";");
    const separator = pair.indexOf("=");
    await context.addCookies([
      {
        name: pair.slice(0, separator),
        value: pair.slice(separator + 1),
        url: "http://127.0.0.1:3000",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
  }
}

async function dismissTour(page) {
  const skip = page.getByRole("button", { name: "Skip" });
  if (await skip.isVisible().catch(() => false)) await skip.click();
}

try {
  const instructor = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await login(instructor, "instructor@ecotech.com", "instructor123");
  const instructorPage = await instructor.newPage();
  await instructorPage.goto("http://127.0.0.1:3000/dashboard", { waitUntil: "networkidle" });
  await dismissTour(instructorPage);
  await instructorPage.getByText("AI Early Warning").waitFor();
  await instructorPage.screenshot({ path: path.join(output, "instructor-agentic-dashboard.png"), fullPage: true });
  const coursePayload = await instructorPage.evaluate(async () => {
    const response = await fetch("/api/courses?creatorId=user_instructor_001");
    return response.json();
  });
  const instructorCourse = coursePayload.data.find((course) => course.lessonsCount > 0);
  if (!instructorCourse) throw new Error("No instructor course with lessons was found");
  await instructorPage.goto(`http://127.0.0.1:3000/courses/${instructorCourse.id}`, { waitUntil: "networkidle" });
  await instructorPage.getByText("Course AI Assistant").waitFor();
  await instructorPage.screenshot({ path: path.join(output, "course-ai-assistant.png"), fullPage: true });
  await instructor.close();

  const student = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await login(student, "alex.student@ecotech.com", "student123");
  const studentPage = await student.newPage();
  const enrollmentResponse = await student.request.get("http://127.0.0.1:3000/api/enrollments");
  const enrollments = await enrollmentResponse.json();
  if (!Array.isArray(enrollments.data)) {
    throw new Error(`Enrollment request failed (${enrollmentResponse.status()}): ${JSON.stringify(enrollments)}`);
  }
  const studentCourse = enrollments.data.find((enrollment) => enrollment.course.lessonsCount > 0);
  if (!studentCourse) throw new Error("No enrolled student course with lessons was found");
  await studentPage.goto(`http://127.0.0.1:3000/courses/${studentCourse.course.id}`, { waitUntil: "networkidle" });
  await dismissTour(studentPage);
  await studentPage.getByText("Mastery Sprint").waitFor();
  await studentPage.screenshot({ path: path.join(output, "student-mastery-sprint.png"), fullPage: true });
  await student.close();
} finally {
  await browser.close();
}
