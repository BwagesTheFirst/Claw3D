/**
 * WelcomeStep — First onboarding screen introducing Claw3D.
 */
import { Building2, Eye, MessageSquare, Users } from "lucide-react";

const features = [
  {
    icon: Eye,
    title: "Watch your agents grind",
    description: "See BranceClaw agents working in real time across all your ventures",
  },
  {
    icon: Users,
    title: "Command your fleet",
    description: "Spin up, configure, and monitor agents from one HQ",
  },
  {
    icon: MessageSquare,
    title: "Talk and approve",
    description: "Chat with agents, approve actions, review code and work product",
  },
  {
    icon: Building2,
    title: "Build your HQ",
    description: "Customize your 3D command center — rooms, desks, the whole vibe",
  },
] as const;

export const WelcomeStep = () => (
  <div className="space-y-5">
    <div className="space-y-2">
      <p className="text-sm leading-relaxed text-white/80">
        Claw3D is your{" "}
        <span className="font-medium text-white">3D command center</span> — a
        virtual office where your AI agents collaborate, code, build, and execute
        tasks across all your projects in real time.
      </p>
      <p className="text-sm text-white/60">
        Connect to your gateway and get your agents working in about two minutes.
      </p>
    </div>

    <div className="grid grid-cols-2 gap-3">
      {features.map(({ icon: Icon, title, description }) => (
        <div
          key={title}
          className="rounded-lg border border-white/8 bg-white/[0.03] px-3.5 py-3"
        >
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 shrink-0 text-emerald-400" />
            <span className="text-xs font-semibold text-white">{title}</span>
          </div>
          <p className="mt-1.5 text-[11px] leading-snug text-white/55">
            {description}
          </p>
        </div>
      ))}
    </div>
  </div>
);
