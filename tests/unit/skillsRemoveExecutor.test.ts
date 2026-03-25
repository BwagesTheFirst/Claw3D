import { beforeEach, describe, expect, it, vi } from "vitest";

import { runSshJson } from "@/lib/ssh/gateway-host";
import { removeSkillOverSsh } from "@/lib/ssh/skills-remove";

vi.mock("@/lib/ssh/gateway-host", () => ({
  runSshJson: vi.fn(),
}));

describe("skills remove ssh executor", () => {
  const mockedRunSshJson = vi.mocked(runSshJson);

  beforeEach(() => {
    mockedRunSshJson.mockReset();
  });

  it("removes skill files via ssh", () => {
    mockedRunSshJson.mockReturnValueOnce({
      removed: true,
      removedPath: "/home/ubuntu/.claw3d/skills/github",
      source: "claw3d-managed",
    });

    const result = removeSkillOverSsh({
      sshTarget: "me@host",
      request: {
        skillKey: "github",
        source: "claw3d-managed",
        baseDir: "/home/ubuntu/.claw3d/skills/github",
        workspaceDir: "/home/ubuntu/.claw3d/workspace-main",
        managedSkillsDir: "/home/ubuntu/.claw3d/skills",
      },
    });

    expect(result).toEqual({
      removed: true,
      removedPath: "/home/ubuntu/.claw3d/skills/github",
      source: "claw3d-managed",
    });
    expect(runSshJson).toHaveBeenCalledWith(
      expect.objectContaining({
        sshTarget: "me@host",
        argv: [
          "bash",
          "-s",
          "--",
          "github",
          "claw3d-managed",
          "/home/ubuntu/.claw3d/skills/github",
          "/home/ubuntu/.claw3d/workspace-main",
          "/home/ubuntu/.claw3d/skills",
        ],
        label: "remove skill (github)",
        input: expect.stringContaining('python3 - "$1" "$2" "$3" "$4" "$5"'),
      })
    );
  });
});
