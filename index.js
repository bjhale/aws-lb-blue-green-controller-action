import { ElasticLoadBalancingV2Client, DescribeRulesCommand, DescribeTagsCommand, SetRulePrioritiesCommand } from "@aws-sdk/client-elastic-load-balancing-v2";
import core from '@actions/core';

const client = new ElasticLoadBalancingV2Client();

const listenerArn = core.getInput('listener_arn', { required: true });
const blueTargetGroupArn = core.getInput('blue_target_group_arn', { required: true });
const greenTargetGroupArn = core.getInput('green_target_group_arn', { required: true });
const blueRuleName = core.getInput('blue_rule_name', { required: true });
const greenRuleName = core.getInput('green_rule_name', { required: true });
const switchTargetGroup = core.getInput('switch_target_group', { required: true }) === 'true';

const describeRulesInput = {
  ListenerArn: listenerArn,
  PageSize: 100 //LB is limited to 100 rules total
};

const describeRulesCommand = new DescribeRulesCommand(describeRulesInput);
const describeRulesResponse = await client.send(describeRulesCommand);

let rules = describeRulesResponse.Rules;


// Hydrate tags
for (const rule of rules) {
  const describeTagsInput = {
    ResourceArns: [rule.RuleArn]
  };
  
  const describeTagsCommand = new DescribeTagsCommand(describeTagsInput);
  const describeTagsResponse = await client.send(describeTagsCommand);

  rule.Tags = describeTagsResponse.TagDescriptions[0].Tags;
}

//console.log(JSON.stringify(rules,null, 2));

const blueRule = rules.filter(rule => 
  rule.Actions[0].TargetGroupArn === blueTargetGroupArn 
  && rule.Tags.filter(tag => tag.Key === 'Name' && tag.Value === blueRuleName).length > 0
)[0];

const greenRule = rules.filter(rule =>
  rule.Actions[0].TargetGroupArn === greenTargetGroupArn
  && rule.Tags.filter(tag => tag.Key === 'Name' && tag.Value === greenRuleName).length > 0
)[0];

let activeRule = null;
let inactiveRule = null;

if (blueRule.Priority < greenRule.Priority) {
  activeRule = blueRule;
  inactiveRule = greenRule;
} else {
  activeRule = greenRule;
  inactiveRule = blueRule;
}

if (switchTargetGroup) {
  const setRulePrioritiesInput = {
    RulePriorities: [
      {
        RuleArn: activeRule.RuleArn,
        Priority: inactiveRule.Priority
      },
      {
        RuleArn: inactiveRule.RuleArn,
        Priority: activeRule.Priority
      }
    ]
  }

  console.log('Set Rule Priorities Input: ', JSON.stringify(setRulePrioritiesInput));

  const setRulePrioritiesCommand = new SetRulePrioritiesCommand(setRulePrioritiesInput);
  const setRulePrioritiesResponse = await client.send(setRulePrioritiesCommand);

  console.log('Set Rule Priorities Response: ', JSON.stringify(setRulePrioritiesResponse));

  // Swap active and inactive rules
  const activeTemp = activeRule;
  activeRule = inactiveRule;
  inactiveRule = activeTemp;
}

console.log(activeRule);
console.log(inactiveRule);

core.setOutput('active_rule_name', activeRule.Tags.filter(tag => tag.Key === 'Name')[0].Value);
core.setOutput('inactive_rule_name', inactiveRule.Tags.filter(tag => tag.Key === 'Name')[0].Value);
core.setOutput('active_target_group_arn', activeRule.Actions[0].TargetGroupArn);
core.setOutput('inactive_target_group_arn', inactiveRule.Actions[0].TargetGroupArn);
