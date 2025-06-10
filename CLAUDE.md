# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a userscript project for enhancing the readability of Tosca Cloud logs. The main script (`index.js`) is a Tampermonkey/Greasemonkey userscript that:

1. **Runs on Tosca Cloud URLs**: Matches `https://*.tricentis.com/_portal/space/*/runs/*`
2. **Enhances log display**: Transforms plain text logs into color-coded, structured output
3. **Real-time monitoring**: Uses MutationObserver to detect DOM changes and re-apply enhancements
4. **Performance optimized**: Implements debouncing and content change detection to avoid unnecessary processing

## Core Architecture

### Log Processing Pipeline

- `findLogContainer()`: Locates log containers using multiple CSS selectors
- `classifyLogLine()`: Categorizes log lines by type (succeeded, failed, info, warning, error)
- `enhanceLogs()`: Main processing function that applies styling and structure
- Special handling for setup/cleanup failures (yellow) vs actual test failures (red)

### Key Features

- **Smart failure classification**: Distinguishes between test failures and setup/evaluation failures
- **Responsive styling**: Maintains readability across different screen sizes
- **DOM change detection**: Automatically updates when new log content appears
- **Debounced updates**: Prevents excessive re-processing during rapid DOM changes

## Log Classification Logic

The script uses sophisticated pattern matching to categorize log lines:

- **Green (succeeded)**: Lines containing `[SUCCEEDED]` or `SUCCESS`
- **Red (failed)**: Test failures, but excludes setup/cleanup operations
- **Yellow (warning)**: Setup/cleanup failures, evaluations, and operations like "IS THE BROWSER OPEN?"
- **Blue (info)**: General information lines with `[INF]` or `INFO`
- **Bold red (error)**: Error lines with `[ERR]` or `ERROR`

## Development Notes

- No build system or package manager required - this is a standalone userscript
- Testing requires browser with userscript manager (Tampermonkey/Greasemonkey)
- Target environment: Tosca Cloud portal pages with test execution logs
- The script handles dynamic content loading and page updates automatically
