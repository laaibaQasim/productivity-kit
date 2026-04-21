# log-analysis

A Python pipeline that reads your `work-logs/*.json` session files and runs them through four LLM analysis passes using the Gemini API, then synthesizes the results into a single final report.

## What it does

1. **Prepare** — flattens all session JSON files into a normalized JSONL/CSV for batch processing
2. **Pass 1 — Prompt audit** — finds recurring ambiguity patterns in how you prompt the AI
3. **Pass 2 — Cost/model** — flags tasks where a cheaper model tier likely would have sufficed
4. **Pass 3 — Skills** — clusters repeated tasks that could become reusable scripts or prompt templates
5. **Pass 4 — Rules** — extracts durable rules and recurring AI mistakes suitable for `.cursorrules`
6. **Synthesize** — merges all pass outputs into one prioritized `final_report.json`

## Prerequisites

- Python 3.9+
- A [Gemini API key](https://aistudio.google.com/app/apikey) (free tier works)

## Setup

Run the `/setup-analysis` command in Cursor chat, or do it manually:

**1. Install dependencies**

```bash
pip install -r log-analysis/requirements.txt
```

**2. Set your API key**

Create a `.env` file in the project root (if it doesn't exist) and add:

```
GEMINI_API_KEY=your_key_here
```

**3. Keep output out of git**

Add the output folder to your local git exclude:

```bash
echo "analysis/" >> .git/info/exclude
```

> The `setup-analysis` command does steps 2 and 3 for you automatically.

## Running the pipeline

From the **project root**, run `prepare` first (required once per log batch), then `run-all`:

```bash
# Flatten logs into analysis-ready files
python log-analysis/log_analysis.py prepare

# Run all passes and generate the final report
python log-analysis/log_analysis.py run-all --out-dir analysis

# Same with verbose logging
python log-analysis/log_analysis.py --verbose run-all --out-dir analysis

# Dry run — previews token estimates with no API calls
python log-analysis/log_analysis.py run-all --out-dir analysis --dry-run
```

## All commands

| Command | Description |
|---------|-------------|
| `prepare` | Flatten `work-logs/*.json` into `analysis/phase1/` |
| `run-all` | Run all four passes and synthesize |
| `run-pass <pass>` | Run one pass (`pass1_prompt_audit`, `pass2_cost`, `pass3_skills`, `pass4_rules`) |
| `synthesize` | Re-run synthesis over existing pass outputs |
| `inspect` | Show how many batch files exist vs. expected for each pass |

### Global flags

| Flag | Default | Description |
|------|---------|-------------|
| `--verbose` | off | Enable debug-level logging |

### `run-all` / `run-pass` flags

| Flag | Default | Description |
|------|---------|-------------|
| `--out-dir` | `analysis` | Output directory |
| `--model` | `gemma-4-31b-it` | Gemini model to use |
| `--dry-run` | off | Preview batch sizes and token estimates; no API calls |
| `--retries` | `5` | Max retries on transient errors |
| `--sleep-seconds` | `3.0` | Base sleep between retries |

### `run-pass`-only flags

| Flag | Description |
|------|-------------|
| `--batch-size` | Override the default batch size for this pass |
| `--no-resume` | Re-run batches even if output files already exist |
| `--start-batch N` | Start from batch N (useful for resuming) |
| `--end-batch N` | Stop after batch N |

## Output structure

```
analysis/
  phase1/
    aggregate.json     # all sessions merged
    flat.jsonl         # one row per session log entry
    flat.csv           # same as JSONL, in CSV format
  pass1_prompt_audit/
    batch_001.json
    ...
  pass2_cost/
  pass3_skills/
  pass4_rules/
  final/
    final_report.json  # top fixes, cost opportunities, skills, rules
```

## Rate limits

The pipeline respects Gemini free-tier limits (15 RPM / 90K TPM) with a sliding-window rate limiter. Long runs throttle automatically — no extra configuration needed.
