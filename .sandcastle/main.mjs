// Parallel Planner with Review — four-phase orchestration loop
//
// This template drives a multi-phase workflow:
//   Phase 1 (Plan):             An opus agent analyzes open issues, builds a
//                               dependency graph, and outputs a <plan> JSON
//                               listing unblocked issues with branch names.
//   Phase 2 (Execute + Review): For each issue, a sandbox is created via
//                               createSandbox(). The implementer runs first
//                               (100 iterations). If it produces commits, a
//                               reviewer runs in the same sandbox on the same
//                               branch (1 iteration). All issue pipelines run
//                               concurrently via Promise.allSettled().
//   Phase 3 (Merge):            A single agent merges all completed branches
//                               into the current branch.
//
// The outer loop repeats up to MAX_ITERATIONS times so that newly unblocked
// issues are picked up after each round of merges.
//
// Usage:
//   npx tsx .sandcastle/main.mts
// Or add to package.json:
//   "scripts": { "sandcastle": "npx tsx .sandcastle/main.mts" }
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
import * as sandcastle from "@ai-hero/sandcastle";
import { docker } from "@ai-hero/sandcastle/sandboxes/docker";
// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
// Maximum number of plan→execute→merge cycles before stopping.
// Raise this if your backlog is large; lower it for a quick smoke-test run.
var MAX_ITERATIONS = 10;
// Hooks run inside the sandbox before the agent starts each iteration.
// npm install ensures the sandbox always has fresh dependencies.
var hooks = {
    sandbox: { onSandboxReady: [{ command: "pnpm install" }] },
};
// Copy node_modules from the host into the worktree before each sandbox
// starts. Avoids a full npm install from scratch; the hook above handles
// platform-specific binaries and any packages added since the last copy.
var copyToWorktree = ["node_modules"];
var _loop_1 = function (iteration) {
    console.log("\n=== Iteration ".concat(iteration, "/").concat(MAX_ITERATIONS, " ===\n"));
    // -------------------------------------------------------------------------
    // Phase 1: Plan
    //
    // The planning agent (opus, for deeper reasoning) reads the open issue list,
    // builds a dependency graph, and selects the issues that can be worked in
    // parallel right now (i.e., no blocking dependencies on other open issues).
    //
    // It outputs a <plan> JSON block — we parse that to drive Phase 2.
    // -------------------------------------------------------------------------
    var plan = await sandcastle.run({
        hooks: hooks,
        sandbox: docker(),
        name: "planner",
        // One iteration is enough: the planner just needs to read and reason,
        // not write code.
        maxIterations: 1,
        // Opus for planning: dependency analysis benefits from deeper reasoning.
        agent: sandcastle.claudeCode("claude-opus-4-6"),
        promptFile: "./.sandcastle/plan-prompt.md",
    });
    // Extract the <plan>…</plan> block from the agent's stdout.
    var planMatch = plan.stdout.match(/<plan>([\s\S]*?)<\/plan>/);
    if (!planMatch) {
        throw new Error("Planning agent did not produce a <plan> tag.\n\n" + plan.stdout);
    }
    // The plan JSON contains an array of issues, each with id, title, branch.
    var issues = JSON.parse(planMatch[1]).issues;
    if (issues.length === 0) {
        // No unblocked work — either everything is done or everything is blocked.
        console.log("No unblocked issues to work on. Exiting.");
        return "break";
    }
    console.log("Planning complete. ".concat(issues.length, " issue(s) to work in parallel:"));
    for (var _i = 0, issues_1 = issues; _i < issues_1.length; _i++) {
        var issue = issues_1[_i];
        console.log("  ".concat(issue.id, ": ").concat(issue.title, " \u2192 ").concat(issue.branch));
    }
    // -------------------------------------------------------------------------
    // Phase 2: Execute + Review
    //
    // For each issue, create a sandbox via createSandbox() so the implementer
    // and reviewer share the same sandbox instance per branch. The implementer
    // runs first; if it produces commits, the reviewer runs in the same sandbox.
    //
    // Promise.allSettled means one failing pipeline doesn't cancel the others.
    // -------------------------------------------------------------------------
    var settled = await Promise.allSettled(issues.map(function (issue) { return __awaiter(void 0, void 0, void 0, function () {
        var sandbox, implement, review;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, sandcastle.createSandbox({
                        branch: issue.branch,
                        sandbox: docker(),
                        hooks: hooks,
                        copyToWorktree: copyToWorktree,
                    })];
                case 1:
                    sandbox = _a.sent();
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, , 6, 8]);
                    return [4 /*yield*/, sandbox.run({
                            name: "implementer",
                            maxIterations: 100,
                            agent: sandcastle.claudeCode("claude-opus-4-6"),
                            promptFile: "./.sandcastle/implement-prompt.md",
                            promptArgs: {
                                TASK_ID: issue.id,
                                ISSUE_TITLE: issue.title,
                                BRANCH: issue.branch,
                            },
                        })];
                case 3:
                    implement = _a.sent();
                    if (!(implement.commits.length > 0)) return [3 /*break*/, 5];
                    return [4 /*yield*/, sandbox.run({
                            name: "reviewer",
                            maxIterations: 1,
                            agent: sandcastle.claudeCode("claude-opus-4-6"),
                            promptFile: "./.sandcastle/review-prompt.md",
                            promptArgs: {
                                BRANCH: issue.branch,
                            },
                        })];
                case 4:
                    review = _a.sent();
                    // Merge commits from both runs so the merge phase sees all of them.
                    // Each sandbox.run() only returns commits from its own run.
                    return [2 /*return*/, __assign(__assign({}, review), { commits: __spreadArray(__spreadArray([], implement.commits, true), review.commits, true) })];
                case 5: return [2 /*return*/, implement];
                case 6: return [4 /*yield*/, sandbox.close()];
                case 7:
                    _a.sent();
                    return [7 /*endfinally*/];
                case 8: return [2 /*return*/];
            }
        });
    }); }));
    // Log any agents that threw (network error, sandbox crash, etc.).
    for (var _a = 0, _b = settled.entries(); _a < _b.length; _a++) {
        var _c = _b[_a], i = _c[0], outcome = _c[1];
        if (outcome.status === "rejected") {
            console.error("  \u2717 ".concat(issues[i].id, " (").concat(issues[i].branch, ") failed: ").concat(outcome.reason));
        }
    }
    // Only pass branches that actually produced commits to the merge phase.
    // An agent that ran successfully but made no commits has nothing to merge.
    var completedIssues = settled
        .map(function (outcome, i) { return ({ outcome: outcome, issue: issues[i] }); })
        .filter(function (entry) {
        return entry.outcome.status === "fulfilled" &&
            entry.outcome.value.commits.length > 0;
    })
        .map(function (entry) { return entry.issue; });
    var completedBranches = completedIssues.map(function (i) { return i.branch; });
    console.log("\nExecution complete. ".concat(completedBranches.length, " branch(es) with commits:"));
    for (var _d = 0, completedBranches_1 = completedBranches; _d < completedBranches_1.length; _d++) {
        var branch = completedBranches_1[_d];
        console.log("  ".concat(branch));
    }
    if (completedBranches.length === 0) {
        // All agents ran but none made commits — nothing to merge this cycle.
        console.log("No commits produced. Nothing to merge.");
        return "continue";
    }
    // -------------------------------------------------------------------------
    // Phase 3: Merge
    //
    // One agent merges all completed branches into the current branch,
    // resolving any conflicts and running tests to confirm everything works.
    //
    // The {{BRANCHES}} and {{ISSUES}} prompt arguments are lists that the agent
    // uses to know which branches to merge and which issues to close.
    // -------------------------------------------------------------------------
    await sandcastle.run({
        hooks: hooks,
        sandbox: docker(),
        name: "merger",
        maxIterations: 1,
        agent: sandcastle.claudeCode("claude-opus-4-6"),
        promptFile: "./.sandcastle/merge-prompt.md",
        promptArgs: {
            // A markdown list of branch names, one per line.
            BRANCHES: completedBranches.map(function (b) { return "- ".concat(b); }).join("\n"),
            // A markdown list of issue IDs and titles, one per line.
            ISSUES: completedIssues.map(function (i) { return "- ".concat(i.id, ": ").concat(i.title); }).join("\n"),
        },
    });
    console.log("\nBranches merged.");
};
// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------
for (var iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
    var state_1 = _loop_1(iteration);
    if (state_1 === "break")
        break;
}
console.log("\nAll done.");
