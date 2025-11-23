/**
 * Test Scenarios
 * Multi-step test scenarios for complex interactions
 */

export interface TestScenario {
  name: string;
  description: string;
  steps: TestStep[];
  expectedOutcome: string;
}

export interface TestStep {
  action: 'send_message' | 'wait_response' | 'pay_service' | 'verify_payment' | 'check_score' | 'verify_content';
  agentId?: string;
  message?: string | ((context: any) => string);
  serviceType?: string;
  amount?: number;
  timeout?: number;
  assertion?: (result: any) => boolean | Promise<boolean>;
  description?: string;
}

export const TEST_SCENARIOS: TestScenario[] = [
  {
    name: 'Basic Conversation Flow',
    description: 'User sends message, agent responds, conversation continues',
    expectedOutcome: 'Agent responds appropriately to each message',
    steps: [
      {
        action: 'send_message',
        agentId: 'trump-donald',
        message: '@trump-donald Hello Mr. President, I need to speak with you.',
        description: 'Send initial greeting',
      },
      {
        action: 'wait_response',
        agentId: 'trump-donald',
        timeout: 30000,
        description: 'Wait for agent response',
      },
      {
        action: 'send_message',
        agentId: 'trump-donald',
        message: '@trump-donald I have a business proposition that could benefit us both.',
        description: 'Follow up with business proposition',
      },
      {
        action: 'wait_response',
        agentId: 'trump-donald',
        timeout: 30000,
        description: 'Wait for second response',
      },
    ],
  },

  {
    name: 'Premium Service Purchase Flow',
    description: 'User requests premium service, pays, and receives service',
    expectedOutcome: 'Payment verified and service delivered',
    steps: [
      {
        action: 'send_message',
        agentId: 'cz',
        message: '@cz I need insider information about the crypto market. What does it cost?',
        description: 'Request premium service',
      },
      {
        action: 'wait_response',
        agentId: 'cz',
        timeout: 30000,
        description: 'Receive payment request (402)',
      },
      {
        action: 'pay_service',
        agentId: 'cz',
        serviceType: 'insider_info',
        amount: 0.0005,
        description: 'Submit payment transaction',
      },
      {
        action: 'wait_response',
        agentId: 'cz',
        timeout: 45000,
        description: 'Wait for service delivery',
      },
      {
        action: 'verify_content',
        description: 'Verify service was delivered',
        assertion: (result) => {
          return result.content.includes('insider') || result.content.length > 100;
        },
      },
    ],
  },

  {
    name: 'Agent-to-Agent Interaction',
    description: 'User asks one agent to contact another agent',
    expectedOutcome: 'Agent successfully contacts other agent and relays response',
    steps: [
      {
        action: 'send_message',
        agentId: 'trump-melania',
        message: '@trump-melania Can you speak with Donald on my behalf about a pardon?',
        description: 'Ask Melania to contact Donald',
      },
      {
        action: 'wait_response',
        agentId: 'trump-melania',
        timeout: 60000,
        description: 'Wait for Melania to contact Donald and respond',
      },
      {
        action: 'verify_content',
        description: 'Verify agent mentioned contacting the other agent',
        assertion: (result) => {
          const content = result.content.toLowerCase();
          return content.includes('donald') || content.includes('president') || content.includes('contacted');
        },
      },
    ],
  },

  {
    name: 'Multi-Agent Negotiation',
    description: 'User negotiates with multiple Trump family members',
    expectedOutcome: 'Successfully engage multiple agents and build relationships',
    steps: [
      {
        action: 'send_message',
        agentId: 'trump-melania',
        message: '@trump-melania I need an introduction to your family to discuss an important matter.',
        description: 'Start with Melania',
      },
      {
        action: 'wait_response',
        agentId: 'trump-melania',
        timeout: 30000,
      },
      {
        action: 'send_message',
        agentId: 'trump-eric',
        message: '@trump-eric Your mother suggested I speak with you about a business opportunity.',
        description: 'Follow up with Eric',
      },
      {
        action: 'wait_response',
        agentId: 'trump-eric',
        timeout: 30000,
      },
      {
        action: 'send_message',
        agentId: 'trump-donald',
        message: '@trump-donald Your family has spoken highly of my proposal. Can we discuss?',
        description: 'Finally approach Donald',
      },
      {
        action: 'wait_response',
        agentId: 'trump-donald',
        timeout: 30000,
      },
    ],
  },

  {
    name: 'Complete Pardon Quest',
    description: 'Full pardon quest from start to finish',
    expectedOutcome: 'User successfully navigates pardon application process',
    steps: [
      // Phase 1: Initial contact with Melania
      {
        action: 'send_message',
        agentId: 'trump-melania',
        message: '@trump-melania Mrs. Trump, I need your help approaching the President about a pardon.',
        description: 'Contact Melania first',
      },
      {
        action: 'wait_response',
        agentId: 'trump-melania',
        timeout: 30000,
      },

      // Phase 2: Gather intel from CZ
      {
        action: 'send_message',
        agentId: 'cz',
        message: '@cz I need insider information about Trump\'s view on crypto pardons.',
        description: 'Request insider info from CZ',
      },
      {
        action: 'wait_response',
        agentId: 'cz',
        timeout: 30000,
      },
      {
        action: 'pay_service',
        agentId: 'cz',
        serviceType: 'insider_info',
        amount: 0.0005,
        description: 'Pay for CZ\'s insider info',
      },
      {
        action: 'wait_response',
        agentId: 'cz',
        timeout: 45000,
      },

      // Phase 3: Contact Trump family members
      {
        action: 'send_message',
        agentId: 'trump-eric',
        message: '@trump-eric Can you help me get your father\'s support for a pardon?',
        description: 'Contact Eric',
      },
      {
        action: 'wait_response',
        agentId: 'trump-eric',
        timeout: 30000,
      },

      // Phase 4: Final approach to Donald Trump
      {
        action: 'send_message',
        agentId: 'trump-donald',
        message: '@trump-donald Mr. President, I\'ve spoken with your family and have a compelling case for a pardon.',
        description: 'Make final pitch to Donald',
      },
      {
        action: 'wait_response',
        agentId: 'trump-donald',
        timeout: 30000,
      },

      // Phase 5: Check scoring
      {
        action: 'check_score',
        description: 'Verify score increased from interactions',
      },
    ],
  },

  {
    name: 'Payment Failure and Retry',
    description: 'Test payment failure handling and retry logic',
    expectedOutcome: 'System handles payment failures gracefully',
    steps: [
      {
        action: 'send_message',
        agentId: 'cz',
        message: '@cz I want to purchase insider information.',
        description: 'Request service',
      },
      {
        action: 'wait_response',
        agentId: 'cz',
        timeout: 30000,
      },
      // Note: Actual payment failure simulation would need special handling
      {
        action: 'pay_service',
        agentId: 'cz',
        serviceType: 'insider_info',
        amount: 0.0005,
        description: 'Attempt payment',
      },
      {
        action: 'wait_response',
        agentId: 'cz',
        timeout: 45000,
      },
    ],
  },
];

/**
 * Get scenario by name
 */
export function getScenario(name: string): TestScenario | undefined {
  return TEST_SCENARIOS.find(s => s.name === name);
}

/**
 * Get all scenario names
 */
export function getAllScenarioNames(): string[] {
  return TEST_SCENARIOS.map(s => s.name);
}

