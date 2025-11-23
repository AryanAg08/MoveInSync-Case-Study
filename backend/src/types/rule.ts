export type Rule = {
  escalate_if_count?: number;
  window_mins?: number;
  escalate_to?: string;
  auto_close_if?: string;
  expires_mins?: number;
};
export type RulesMap = Record<string, Rule>;
