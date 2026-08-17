import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function wrapHtml(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title></title>
<script src="https://cdn.tailwindcss.com"></script>
<style>body { margin: 0; padding: 0; font-family: system-ui, -apple-system, sans-serif; }
* { box-sizing: border-box; }</style>
</head>
<body class="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">

</body>
</html>`;
}