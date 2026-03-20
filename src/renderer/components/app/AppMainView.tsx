import { memo } from "react"
import { useAtom, useAtomValue } from "jotai"
import { mainViewAtom, factoryBetaEnabledAtom } from "@/lib/store"
import { WorkflowPanel } from "@/components/WorkflowPanel"
import { SkillsPage } from "@/components/SkillsPage"
import { WorkflowsTemplatesPage } from "@/components/WorkflowsTemplatesPage"
import { ArtifactsPage } from "@/components/ArtifactsPage"
import { FactoryPage } from "@/components/FactoryPage"
import { SettingsPage } from "@/components/SettingsPage"
import { NotificationsPage } from "@/components/NotificationsPage"
import { OnboardingWizard } from "@/components/OnboardingWizard"
import { WorkflowCreatePage } from "@/components/WorkflowCreatePage"

export const AppMainView = memo(function AppMainView() {
  const [mainView] = useAtom(mainViewAtom)
  const factoryBetaEnabled = useAtomValue(factoryBetaEnabledAtom)

  if (mainView === "onboarding") return <OnboardingWizard />
  if (mainView === "factory") return factoryBetaEnabled ? <FactoryPage /> : <WorkflowPanel />
  if (mainView === "workflow_create") return <WorkflowCreatePage />
  if (mainView === "skills") return <SkillsPage />
  if (mainView === "templates") return <WorkflowsTemplatesPage />
  if (mainView === "artifacts") return <ArtifactsPage />
  if (mainView === "settings") return <SettingsPage />
  if (mainView === "inbox") return <NotificationsPage />

  return <WorkflowPanel />
})
