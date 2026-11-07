import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { connectCs2 } from "./mcp.js";
import { departments, getDepartment } from "./departments.js";
import { runDepartment, type Approver } from "./department-agent.js";

const BRIEFING_TASK =
  "Give the Mayor your department's briefing. Read the current state, decide whether any change within " +
  "your mandate is warranted right now, make it if so (it will go to the Mayor for approval), verify it, and report.";

const terminalApprover: Approver = async (dept, tool, input) => {
  if (process.env.AUTO_APPROVE === "true") return true;
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    const answer = await rl.question(
      `\n${dept.name} requests ${tool} ${JSON.stringify(input)}\nApprove? [y/N] `,
    );
    return answer.trim().toLowerCase().startsWith("y");
  } finally {
    rl.close();
  }
};

async function main() {
  const [cmd, deptId, ...rest] = process.argv.slice(2);
  if (!cmd || !["tools", "brief", "ask"].includes(cmd)) {
    console.log(
      `Usage:\n  npm run tools                       list MCP server tools and input schemas\n` +
        `  npm run brief -- <dept>             department briefing (may propose changes)\n` +
        `  npm run ask -- <dept> "<directive>" give a department a directive\n\n` +
        `Departments: ${departments.map((d) => d.id).join(", ")}`,
    );
    process.exit(1);
  }

  const mcp = await connectCs2();
  try {
    const { tools } = await mcp.listTools();

    if (cmd === "tools") {
      for (const t of tools) {
        console.log(`\n## ${t.name}\n${t.description ?? ""}\n${JSON.stringify(t.inputSchema)}`);
      }
      return;
    }

    if (!deptId) throw new Error("Name a department.");
    const dept = getDepartment(deptId);
    const task = cmd === "brief" ? BRIEFING_TASK : `Directive from the Mayor: ${rest.join(" ")}`;
    console.log(`\n=== ${dept.name} ===\n`);
    console.log(await runDepartment(mcp, tools, dept, task, terminalApprover));
  } finally {
    await mcp.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
