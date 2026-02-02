# End of Day Report Generator

Generate an end-of-day report for the current session based on git changes and conversation context.

## Instructions

1. Check `git status` and `git diff --stat` to see what files were modified
2. Check `git log --oneline -10` for recent commits
3. Review the conversation context for tasks completed

Generate a report using this exact format:

```
NAME: Danilo Jr. B. Casim
POSITION: IT Intern
DATE: {{current_date}}
TIME IN: {{time_in}}
TIME OUT: {{time_out}}
TOTAL OF HOURS: {{total_hours}}

END OF DAY REPORT:
{{summary_of_work}}

NEXT STEPS:
{{next_steps}}

NEXT SHIFT: {{next_shift_date}} – 1:00 P.M. onwards
```

## Parameters

- `time_in`: Start time (default: "1:00 PM")
- `time_out`: End time (ask user if not provided)
- Automatically calculate next shift date (next weekday)

## Report Content Guidelines

For "END OF DAY REPORT":
- List files created/modified with brief descriptions
- Summarize technical findings and analysis completed
- Use bullet points for clarity

For "NEXT STEPS":
- List actionable items derived from the work done
- Reference specific files or tasks to continue

$ARGUMENTS
