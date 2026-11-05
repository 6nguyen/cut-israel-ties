# State Israel-bond holdings sweep
Researched: 2026-11-04 · Informs: docs/prd/state-holdings-sweep.md

The question: for each of the 50 states, does the treasury or the main
pension system hold bonds issued by the State of Israel, how much, as of
what date, and who decides the next rollover. One row per state; a row is
filled only from the state's own document (treasurer investment report or
pension holdings disclosure), and the `states.csv` row is produced by
`npm run draft-holding -w worker -- <STATE> <url>` from that document,
never typed by hand.

This file is a dated snapshot. A later sweep adds a new file with a
`Supersedes` line rather than rewriting these rows.

## How to fill a row (maintainer, batches of ten)
1. Find the treasurer's latest investment or holdings report and the
   main pension system's holdings disclosure; paste the URLs.
2. Run `draft-holding` on each URL (HTML or plain text; save a PDF's text
   to a `.txt` the tool can fetch). A row prints only with a verbatim
   quote, a figure inside the quote and an as-of date.
3. Result is `held` (amount in the quote), `none` (the document states no
   Israel bonds) or `not found` (neither document says). `not found`
   leaves `states.csv` at `unknown`.
4. One `data/` PR per batch: these rows plus the `states.csv` rows; the
   PR body lists the `not found` states.

Batch order follows the PRD proposal: states with a known campaign first
(batch 1), then alphabetical.

## Status by state
| State | Batch | Treasurer report URL | Pension disclosure URL | Result | Date checked |
|---|---|---|---|---|---|
| Alabama (AL) | 2 | not checked | not checked | not checked | — |
| Alaska (AK) | 2 | not checked | not checked | not checked | — |
| Arizona (AZ) | 2 | not checked | not checked | not checked | — |
| Arkansas (AR) | 2 | not checked | not checked | not checked | — |
| California (CA) | 1 | not checked | not checked | not checked | — |
| Colorado (CO) | 2 | not checked | not checked | not checked | — |
| Connecticut (CT) | 2 | not checked | not checked | not checked | — |
| Delaware (DE) | 2 | not checked | not checked | not checked | — |
| Florida (FL) | 2 | not checked | not checked | not checked | — |
| Georgia (GA) | 2 | not checked | not checked | not checked | — |
| Hawaii (HI) | 2 | not checked | not checked | not checked | — |
| Idaho (ID) | 3 | not checked | not checked | not checked | — |
| Illinois (IL) | 1 | not checked | not checked | not checked | — |
| Indiana (IN) | 3 | not checked | not checked | not checked | — |
| Iowa (IA) | 3 | not checked | not checked | not checked | — |
| Kansas (KS) | 3 | not checked | not checked | not checked | — |
| Kentucky (KY) | 3 | not checked | not checked | not checked | — |
| Louisiana (LA) | 3 | not checked | not checked | not checked | — |
| Maine (ME) | 3 | not checked | not checked | not checked | — |
| Maryland (MD) | 1 | not checked | not checked | not checked | — |
| Massachusetts (MA) | 1 | not checked | not checked | not checked | — |
| Michigan (MI) | 3 | not checked | not checked | not checked | — |
| Minnesota (MN) | 1 | not checked | not checked | not checked | — |
| Mississippi (MS) | 3 | not checked | not checked | not checked | — |
| Missouri (MO) | 3 | not checked | not checked | not checked | — |
| Montana (MT) | 4 | not checked | not checked | not checked | — |
| Nebraska (NE) | 4 | not checked | not checked | not checked | — |
| Nevada (NV) | 4 | not checked | not checked | not checked | — |
| New Hampshire (NH) | 4 | not checked | not checked | not checked | — |
| New Jersey (NJ) | 1 | not checked | not checked | not checked | — |
| New Mexico (NM) | 4 | not checked | not checked | not checked | — |
| New York (NY) | 1 | not checked | not checked | not checked | — |
| North Carolina (NC) | 4 | not checked | not checked | not checked | — |
| North Dakota (ND) | 4 | not checked | not checked | not checked | — |
| Ohio (OH) | 4 | not checked | not checked | not checked | — |
| Oklahoma (OK) | 4 | not checked | not checked | not checked | — |
| Oregon (OR) | 4 | not checked | not checked | not checked | — |
| Pennsylvania (PA) | 1 | not checked | not checked | not checked | — |
| Rhode Island (RI) | 5 | not checked | not checked | not checked | — |
| South Carolina (SC) | 5 | not checked | not checked | not checked | — |
| South Dakota (SD) | 5 | not checked | not checked | not checked | — |
| Tennessee (TN) | 5 | not checked | not checked | not checked | — |
| Texas (TX) | 1 | not checked | not checked | not checked | — |
| Utah (UT) | 5 | not checked | not checked | not checked | — |
| Vermont (VT) | 5 | not checked | not checked | not checked | — |
| Virginia (VA) | 5 | not checked | not checked | not checked | — |
| Washington (WA) | 1 | not checked | not checked | not checked | — |
| West Virginia (WV) | 5 | not checked | not checked | not checked | — |
| Wisconsin (WI) | 5 | not checked | not checked | not checked | — |
| Wyoming (WY) | 5 | not checked | not checked | not checked | — |

## Tally (updates with each batch)
| Result | States |
|---|---|
| held | 0 |
| none | 0 |
| not found | 0 |
| not checked | 50 |
