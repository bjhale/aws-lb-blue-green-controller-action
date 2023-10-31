import { ElasticLoadBalancingV2Client, DescribeRulesCommand, SetRulePrioritiesCommand } from "@aws-sdk/client-elastic-load-balancing-v2";
import core from '@actions/core';

const client = new ElasticLoadBalancingV2Client();

const blueRuleArn = core.getInput('blue_rule_arn', { required: true });
const greenRuleArn = core.getInput('green_rule_arn', { required: true });
const switchActiveRule = core.getInput('switch_active_rule', { required: true }) === 'true';

const describeBlueRuleInput = {
  RuleArns: [blueRuleArn],
};

const describeGreenRuleInput = {
  RuleArns: [greenRuleArn],
};

const describeBlueRuleCommand = new DescribeRulesCommand(describeBlueRuleInput);
const describeGreenRuleCommand = new DescribeRulesCommand(describeGreenRuleInput);
const describeBlueRuleResponse = await client.send(describeBlueRuleCommand);
const describeGreenRuleResponse = await client.send(describeGreenRuleCommand);

const blueRule = {...describeBlueRuleResponse.Rules[0], Name: 'blue'};
const greenRule = {...describeGreenRuleResponse.Rules[0], Name: 'green'};

let activeRule = blueRule.Priority < greenRule.Priority ? blueRule : greenRule;
let inactiveRule = blueRule.Priority < greenRule.Priority ? greenRule : blueRule;

if(switchActiveRule) {
  const setRulePrioritiesInput = {
    RulePriorities: [
      {
        Priority: inactiveRule.Priority,
        RuleArn: activeRule.RuleArn,
      },
      {
        Priority: activeRule.Priority,
        RuleArn: inactiveRule.RuleArn,
      },
    ],
  };

  const setRulePrioritiesCommand = new SetRulePrioritiesCommand(setRulePrioritiesInput);
  await client.send(setRulePrioritiesCommand);

  const activeTemp = activeRule;
  activeRule = inactiveRule;
  inactiveRule = activeTemp;
}

core.setOutput('active_rule', activeRule.Name);
core.setOutput('inactive_rule', inactiveRule.Name);
core.setOutput('active_rule_arn', activeRule.RuleArn);
core.setOutput('inactive_rule_arn', inactiveRule.RuleArn);
