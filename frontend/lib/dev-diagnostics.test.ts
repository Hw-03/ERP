const { buildExitDump, classifyExitReason } = require("../scripts/dev-diagnostics.js");

describe("dev diagnostics", () => {
  it("includes process context and pipe errors in exit dumps", () => {
    const startTime = new Date("2026-07-08T00:00:00.000Z");
    const endTime = new Date("2026-07-08T00:00:05.000Z");

    const dump = buildExitDump({
      reason: "child-exit",
      code: 0,
      signal: null,
      childPid: 1234,
      startTime,
      endTime,
      port: "3001",
      hostname: "0.0.0.0",
      cwd: "C:\\ERP\\frontend",
      parentProcess: {
        pid: 100,
        commandLine: "powershell start-frontend.ps1",
      },
      childProcess: {
        pid: 1234,
        commandLine: "node next dev --port 3001",
      },
      pipeErrors: [{ stream: "stdout", message: "EPIPE: broken pipe, write" }],
      portOwners: [{ pid: 1234, localPort: 3001 }],
    });

    expect(dump.parentProcess.commandLine).toContain("start-frontend");
    expect(dump.childProcess.commandLine).toContain("--port 3001");
    expect(dump.pipeErrors[0].stream).toBe("stdout");
    expect(dump.portOwners[0].localPort).toBe(3001);
  });

  it("classifies clean child exit as unexpected when no signal was recorded", () => {
    expect(
      classifyExitReason({
        reason: "child-exit",
        code: 0,
        signal: null,
        receivedSignals: [],
        pipeErrors: [],
      })
    ).toBe("child-exit-zero-unexpected");
  });

  it("classifies broken output pipe separately", () => {
    expect(
      classifyExitReason({
        reason: "uncaught-exception",
        code: null,
        signal: null,
        receivedSignals: [],
        pipeErrors: [{ stream: "stdout", message: "EPIPE: broken pipe, write" }],
      })
    ).toBe("output-pipe-broken");
  });
});
