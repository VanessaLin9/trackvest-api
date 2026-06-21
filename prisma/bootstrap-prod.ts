import { runSeedEntrypoint } from './seed/run-entrypoint'
import { runProductionBootstrap } from './seed/bootstrap-runner'

runSeedEntrypoint(runProductionBootstrap)
