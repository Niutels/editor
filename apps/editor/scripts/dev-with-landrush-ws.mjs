import { spawn } from 'node:child_process'

const bun = process.platform === 'win32' ? 'bun.exe' : 'bun'
const children = new Set()

const ws = start('landrush-ws', [bun, ['scripts/landrush-world-multiplayer-ws.mjs']], {
  critical: false,
})
const next = start('next', [bun, ['x', 'next', 'dev', '--turbo', '--port', '3002']], {
  critical: true,
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    stopChildren()
    process.exit(0)
  })
}

function start(label, [command, args], { critical }) {
  const child = spawn(command, args, {
    env: process.env,
    shell: false,
    stdio: 'inherit',
  })
  children.add(child)

  child.on('exit', (code, signal) => {
    children.delete(child)
    if (!critical) {
      console.log(`${label} exited`)
      return
    }

    if (process.exitCode !== undefined) return

    process.exitCode = code ?? (signal ? 1 : 0)
    console.log(`${label} exited`)
    stopChildren(child)
  })

  return child
}

function stopChildren(except) {
  for (const child of children) {
    if (child === except || child.killed) continue
    child.kill()
  }
}

void ws
void next
