export const TOURNAMENT_FORMATS = Object.freeze({
  SINGLE_ELIMINATION: "single_elimination",
  DOUBLE_ELIMINATION: "double_elimination",
  ROUND_ROBIN: "round_robin",
  GROUP_KNOCKOUT: "group_knockout"
});

export const TOURNAMENT_FORMAT_OPTIONS = Object.freeze([
  { value: TOURNAMENT_FORMATS.SINGLE_ELIMINATION, label: "Tim · Single elimination" },
  { value: TOURNAMENT_FORMATS.DOUBLE_ELIMINATION, label: "Tim · Double elimination" },
  { value: TOURNAMENT_FORMATS.ROUND_ROBIN, label: "Tim · Round robin" },
  { value: TOURNAMENT_FORMATS.GROUP_KNOCKOUT, label: "Tim · Group + knockout" }
]);

export const tournamentFormatLabel = format => TOURNAMENT_FORMAT_OPTIONS.find(option => option.value === (format === "single" ? TOURNAMENT_FORMATS.SINGLE_ELIMINATION : format))?.label || "Single elimination";
