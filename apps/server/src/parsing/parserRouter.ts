import type { ParsedLogData } from "@aeroslm/shared";
import { ingestTextLog } from "./ingestion/textIngestion.js";
import { genericTextParser } from "./parsers/genericTextParser.js";
import { openfoamParser } from "./parsers/openfoamParser.js";
import type { ParseLogInput, SolverLogParser } from "./types.js";

const parserRegistry: SolverLogParser[] = [openfoamParser, genericTextParser];

export function routeLogParser(input: ParseLogInput): ParsedLogData {
  const ingested = ingestTextLog(input);
  const parser = parserRegistry.find((candidate) => candidate.canParse(ingested)) ?? genericTextParser;
  return parser.parse(ingested);
}
