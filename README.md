# reproof

> 记下一条命令，日后再证明一次。

三天前你查了个问题，报告里写着「接口返回 401」。今天有人问：你还确定吗？你打开终端，得先想起来当时敲的到底是哪条命令，跑完一遍，再解释为什么这次和上次不一样。

这中间的十分钟，是这个项目存在的理由。

`reproof` 不下结论，也不做断言。它只做一件事：把**产生结论的那条命令**连同它的输出指纹存下来。之后任何时刻重跑一遍，告诉你这个结论还在不在。

```bash
$ reproof run --tag http -- curl -sS -o /dev/null -w '%{http_code}' https://example.com
recorded ev_mwween7x_8af2c6  exit=0  41ms  sha256:4ff42c3e48cc…

$ reproof verify
**1** records — 1 MATCH · 0 DRIFT · 0 ERROR · 0 SKIP

| | status | command | detail |
| --- | --- | --- | --- |
| ✅ | MATCH | `curl -sS -o /dev/null -w %{http_code} https://example.com` | 38ms |
```

## 为什么不是"跑个测试"

测试断言的是**代码应该怎样**，reproof 记录的是**系统当时怎样**。这两件事经常不同：你的测试全绿，线上那个端口照样是开的。

扫描器、巡检脚本、临时排查，共同点是"跑一次看一眼就过去了"。三个月后回头看报告，没人说得清那条结论是几点得出的、在什么状态下得出的。reproof 把这一格补上。

## 安装

```bash
npm install -g @zhehua/re-proof     # 命令名是 reproof
npm install @zhehua/re-proof        # 当库用
```

Node 18 以上，零运行时依赖。`reproof` 在 npm 上被一个 0.0.0 的空包占着，`re-proof` 又被判定为“与现有包过于相似”而拒绝，最后落在 `@zhehua/re-proof`。命令名没变，还是 `reproof`。

## 三个命令

```bash
# 记录。默认不走 shell，`--` 后面就是你真正要跑的东西
reproof run --tag dns -- dig +short example.com A

# 想走 shell 也行，不加 `--` 就交给 sh -c
reproof run "ss -ltnp | grep 8899"

# 看存了什么
reproof list
reproof list --tag dns --json

# 重跑。全部，或者只跑一组
reproof verify
reproof verify --only dns
reproof verify --only ev_mwween7x_8af2c6 --json
```

## 四种结果

| 状态 | 含义 | 你该做什么 |
| --- | --- | --- |
| `MATCH` | 退出码和输出指纹都没变 | 结论成立，继续 |
| `DRIFT` | 命令跑得通，输出变了 | 结论过期了，报告里带上第一处差异行 |
| `ERROR` | 命令跑不起来——工具没了、路径变了、没权限 | 先修环境，再谈结论 |
| `SKIP` | 记录里没有 argv，无从重放 | 这条本来就不该进库 |

`DRIFT` 不是失败。它标的是**这份结论的时效性**。一份全是 DRIFT 的报告，比一份没写日期的报告诚实得多。

## 时间戳、pid、端口

这些东西每次跑都不一样，会让所有验证变成 DRIFT。在算指纹之前用 `--strip` 把它们剔掉：

```bash
reproof run --tag log --strip '\d{4}-\d{2}-\d{2}T[\d:.]+Z' -- cat /var/log/app.log
```

`--strip` 收的是 JavaScript 正则，可以传多次。ANSI 颜色码和行尾空白永远先剥掉——那些从来没有信息量。

## 当 CI 用

退出码只有三种：

| 码 | 含义 |
| --- | --- |
| `0` | 全部 MATCH |
| `1` | 至少有一条 DRIFT 或 ERROR |
| `2` | 参数写错了 |

所以：

```yaml
- run: npx @zhehua/re-proof verify
```

服务行为一改，构建就红，而且直接告诉你哪一行变了。

## 当库用

```js
import { record, verifyAll, latest, normalize, sha } from '@zhehua/re-proof'

const rec = await record(['curl', '-sS', 'https://example.com'], {
  tag: 'http',
  timeoutMs: 10_000,
  strips: ['\\d{2}:\\d{2}:\\d{2}'],
})

const result = await verifyAll({ only: 'http' })
console.log(result.counts) // { MATCH: 1, DRIFT: 0, ERROR: 0, SKIP: 0 }
```

| 导出 | 做什么 |
| --- | --- |
| `record(argv, options)` | 跑一次，存下来 |
| `verifyAll()` / `verifyOne(rec)` | 重跑、分类 |
| `latest()` / `read()` | 读库 |
| `normalize()` / `sha()` | 哈希那两个原语 |
| `firstDiff(before, after)` | 找第一处差异，带上下文 |

## 几个取舍

**追加式 JSONL。** 存在 `.reproof/records.jsonl`，一行一条，从不改写。进程被杀写了半行，读的时候跳过那行，前面的历史全在。不用数据库，是因为这东西的价值在于"十年后还能读"，而不在于查询性能。

**默认不走 shell。** `spawn(argv[0], argv.slice(1))`，记什么跑什么。`sh -c` 是你显式选的。这样"重放"不会因为你的 shell 环境变了而变味。

**哈希的是归一化后的输出。** 相同观测得到相同指纹，表面噪声不会制造假漂移。

**数据不出机器。** 没有网络请求，没有遥测，没有账号。

## 它不做什么

不是测试框架——它不做断言，只观测和记忆。不是监控，不是模糊测试，也不是扫描器。

它是"跑一次"和"写进报告"之间那个没人补的格子。

## License

MIT

---

# reproof

> Record a command. Prove it again later.

Three days ago you checked something and wrote "the API returns 401" in a report. Today someone asks whether you're still sure. You open a terminal, try to remember which command it was, run it again, and then explain why the answer moved.

That ten-minute gap is why this exists.

`reproof` doesn't judge and doesn't assert. It stores the **command behind a claim**, along with a fingerprint of what it printed. Any time later it replays that command and tells you whether the claim still holds.

## Installation

```bash
npm install -g @zhehua/re-proof     # the binary is reproof
npm install @zhehua/re-proof        # as a library
```

Node 18+, zero runtime dependencies. `reproof` on npm is a 0.0.0 placeholder owned by someone else, and `re-proof` was rejected as too similar to it; the package therefore lives at `@zhehua/re-proof`. The binary name did not change.

## Three commands

```bash
reproof run --tag dns -- dig +short example.com A   # no shell by default
reproof run "ss -ltnp | grep 8899"                  # sh -c is opt-in
reproof list [--tag dns] [--json]
reproof verify [--only dns] [--only <id>] [--json]
```

## Four outcomes

| Status | Meaning | What to do |
| --- | --- | --- |
| `MATCH` | exit code and output fingerprint unchanged | the claim holds |
| `DRIFT` | command still runs, output moved | the claim expired — the report carries the first differing line |
| `ERROR` | command no longer runs (missing tool, moved path, no permission) | fix the environment first |
| `SKIP` | no argv in the record | this one should not have been stored |

`DRIFT` is not a failure. It marks how fresh a claim is, and a report full of DRIFT rows is more honest than one with no dates on it.

## Volatile output

Timestamps, pids and ports change on every run, which would turn every verification into DRIFT. Strip them before hashing:

```bash
reproof run --tag log --strip '\d{4}-\d{2}-\d{2}T[\d:.]+Z' -- cat /var/log/app.log
```

`--strip` takes a JavaScript regular expression and can be repeated. ANSI colours and trailing whitespace are always removed first — they never carry information.

## In CI

| Exit | Meaning |
| --- | --- |
| `0` | everything MATCHed |
| `1` | at least one DRIFT or ERROR |
| `2` | bad usage |

```yaml
- run: npx @zhehua/re-proof verify
```

Change the observable behaviour of your service and the build goes red, naming the line that moved.

## As a library

```js
import { record, verifyAll } from '@zhehua/re-proof'

const rec = await record(['curl', '-sS', 'https://example.com'], {
  tag: 'http',
  timeoutMs: 10_000,
  strips: ['\\d{2}:\\d{2}:\\d{2}'],
})

const { counts } = await verifyAll({ only: 'http' })
```

## Design notes

- **Append-only JSONL** at `.reproof/records.jsonl`, one record per line, never rewritten. A half-written trailing line from a killed process is skipped, not fatal. No database, because the value here is "still readable in ten years", not query throughput.
- **No shell by default**: `spawn(argv[0], argv.slice(1))`. What you recorded is what runs. `sh -c` is explicitly opt-in.
- **Hash of normalised output**, so identical observations hash identically and cosmetic noise doesn't create fake drift.
- **Nothing leaves the machine.** No network, no telemetry, no accounts.

## What it is not

Not a test runner — it does not assert, it observes and remembers. Not a monitor, not a fuzzer, not a scanner. It is the missing layer between running a command once and putting the result in a report someone else reads.

## License

MIT
