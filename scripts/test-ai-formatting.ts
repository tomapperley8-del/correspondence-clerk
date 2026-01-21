/**
 * Test script for AI formatting with structured outputs
 * Tests the fix for JSON parsing errors with long email threads
 *
 * Usage: tsx scripts/test-ai-formatting.ts
 */

import { config } from 'dotenv';
import { join } from 'path';
import { formatCorrespondence } from '../lib/ai/formatter';

// Load environment variables from .env.local
config({ path: join(__dirname, '..', '.env.local') });

// Test case 1: Simple email (baseline)
const simpleEmail = `
From: john@example.com
To: bridget@chiswickcalendar.co.uk
Subject: Quick question
Date: Mon, 15 Jan 2024 10:30:00 +0000

Hi Bridget,

Just wanted to confirm our meeting next week.

Thanks,
John
`;

// Test case 2: Medium thread (5 emails)
const mediumThread = `
Email from me to John Smith, 10/01/2024
……………………………………………………………………………

Hi John,

Can you send me the updated proposal?

Thanks,
Bridget

……………………………………………………………………………
Email from John Smith to me, 11/01/2024

Hi Bridget,

Sure, I'll send it over by Friday.

Best,
John

……………………………………………………………………………
Email from me to John Smith, 12/01/2024

Great, looking forward to it.

Bridget

……………………………………………………………………………
Email from John Smith to me, 15/01/2024

Hi Bridget,

Attached is the proposal. Let me know if you have questions.

Best,
John

……………………………………………………………………………
Email from me to John Smith, 16/01/2024

Perfect, I'll review and get back to you next week.

Thanks,
Bridget
`;

// Test case 3: Large thread (10+ emails, ~13KB)
// This simulates the case that was causing JSON parsing errors
const largeThread = `
Email from me to Sarah Johnson, 05/12/2024
……………………………………………………………………………

Hi Sarah,

I wanted to reach out regarding the upcoming Chiswick Calendar event in February. We're planning a special feature for local businesses and I think your restaurant would be a perfect fit.

The event will run from February 10-17, and we're offering special advertising packages for participating venues. Would you be interested in learning more about this opportunity?

Looking forward to hearing from you.

Best regards,
Bridget
Chiswick Calendar

……………………………………………………………………………
Email from Sarah Johnson to me, 06/12/2024

Hi Bridget,

Thank you for reaching out! Yes, I'm definitely interested in learning more about this. Can you send me details about the advertising packages and what's involved?

Also, what kind of commitment would we need to make in terms of time and resources?

Thanks,
Sarah

……………………………………………………………………………
Email from me to Sarah Johnson, 09/12/2024

Hi Sarah,

Great to hear you're interested! Here are the details:

**Advertising Packages:**
1. Bronze Package (£250) - Quarter page ad in print edition, social media mentions
2. Silver Package (£500) - Half page ad, social media campaign, featured article
3. Gold Package (£850) - Full page ad, premium social media, featured article, event hosting

**What's Involved:**
- Provide high-quality images and content (we can help with this)
- Availability for a brief interview for the featured article (Silver/Gold only)
- Optional: Host a small event during the week (Gold package)

**Timeline:**
- Decision needed by: January 5, 2025
- Content submission: January 15, 2025
- Publication date: February 10, 2025

The time commitment is minimal - most businesses spend about 2-3 hours total on content preparation. We handle all the heavy lifting for design and marketing.

Would you like to set up a call to discuss further? I'm available next week Tuesday or Wednesday afternoon.

Best,
Bridget

……………………………………………………………………………
Email from Sarah Johnson to me, 10/12/2024

Hi Bridget,

This looks really interesting. I think the Silver Package would work well for us. A few questions:

1. Can we see examples of previous featured articles?
2. What kind of reach does the social media campaign typically have?
3. Is there flexibility on the content deadline if we commit early?

Also, I'd love to set up that call. Wednesday afternoon works great for me - how about 2pm?

Thanks,
Sarah

……………………………………………………………………………
Email from me to Sarah Johnson, 11/12/2024

Hi Sarah,

Perfect! Let's lock in Wednesday, December 18th at 2pm. I'll send you a calendar invite.

To answer your questions:

1. **Examples**: I'll attach PDFs of three recent featured articles from our November issue. You'll see we do a nice mix of story-telling and practical information (hours, menu highlights, what makes you unique).

2. **Social Media Reach**: Our campaigns typically reach 15,000-25,000 people across Facebook and Instagram, with engagement rates of 4-6%. We also include Stories, Reels, and carousel posts featuring your business throughout the week.

3. **Content Deadline**: Absolutely! If you commit by December 20th, we can extend your content deadline to January 22nd. That gives you an extra week to gather materials.

I'm also attaching our media kit which has more detailed analytics and testimonials from previous advertisers.

Looking forward to our call!

Best,
Bridget

……………………………………………………………………………
Email from Sarah Johnson to me, 14/12/2024

Hi Bridget,

Thank you so much for the examples and information - they look fantastic! I showed them to my business partner and we're both very excited about this opportunity.

We'd like to move forward with the Silver Package. A couple more things:

1. For the featured article interview, could we do it at the restaurant? We'd love to show you around and maybe have you try some dishes that we'd want to highlight.

2. We're considering upgrading to Gold if the event hosting option is flexible. What kind of events have other restaurants done? We were thinking maybe a wine tasting or chef's special menu night.

3. Payment - do you need full payment upfront or can we do 50% now and 50% before publication?

See you Wednesday at 2pm!

Sarah

……………………………………………………………………………
Email from me to Sarah Johnson, 16/12/2024

Hi Sarah,

Wonderful news! So glad you're both excited about this.

To answer your questions:

1. **Interview Location**: Absolutely! In fact, I prefer doing interviews on-site. It makes for much better content and photos. Plus, I never say no to trying great food! We'll plan for about 90 minutes - 30 for the interview, 30 for photos, and 30 for tasting.

2. **Event Hosting for Gold**: Those are both excellent ideas! Previous restaurants have done:
   - Wine pairing dinners (very popular)
   - Chef's table experiences
   - Cooking demonstrations
   - "Meet the maker" events with local suppliers
   - Special tasting menus

   Your wine tasting idea would work perfectly. We'd promote it through our channels, and typically these events bring in 20-30 people who are already interested because they saw your feature. It's great for building your customer base.

3. **Payment Terms**: We can definitely do 50/50! First half when you sign the agreement (which I'll bring to Wednesday's meeting), and the second half by January 31st.

If you're leaning toward Gold with the wine tasting, let's discuss the details on Wednesday. I can also connect you with a couple of restaurants who did similar events so you can hear about their experience firsthand.

See you Wednesday!

Bridget

……………………………………………………………………………
Email from Sarah Johnson to me, 17/12/2024

Hi Bridget,

Quick question before tomorrow - do you have any dietary restrictions? Want to make sure we prepare the right tasting menu for you!

Also, my business partner Tom would like to join the meeting if that's okay. He handles most of our wine selection so he'll be helpful for planning the potential wine tasting event.

Sarah

……………………………………………………………………………
Email from me to Sarah Johnson, 17/12/2024

Hi Sarah,

No dietary restrictions at all - I'm an adventurous eater! That's so thoughtful of you to ask.

And absolutely, please have Tom join us! It'll be great to meet him and hear his thoughts on the wine tasting concept. The more we can plan out during this meeting, the smoother everything will go.

See you both tomorrow at 2pm!

Bridget

……………………………………………………………………………
Email from Sarah Johnson to me, 19/12/2024

Hi Bridget,

It was wonderful meeting you yesterday! Tom and I are absolutely convinced - we want to go with the Gold Package.

The lunch was our pleasure, and we're so excited to work with you on this. After discussing it last night, we've decided to do the wine tasting event on February 14th (Valentine's week seems perfect!).

Here's what we're thinking:
- 6:30pm start
- 5-course tasting menu with wine pairing
- Limited to 30 guests
- Price: £75 per person
- We'll donate £10 from each ticket to the local food bank

Can you let us know the next steps? We're ready to sign the agreement and make the first payment.

Thanks for everything!
Sarah & Tom

……………………………………………………………………………
Email from me to Sarah Johnson, 20/12/2024

Hi Sarah and Tom,

I'm thrilled! This is going to be fantastic. Valentine's week is absolutely perfect timing, and I love the charitable component - our readers really appreciate businesses that give back to the community.

**Next Steps:**

1. **Agreement & Payment**: I'm sending over the Gold Package agreement today via DocuSign. Once you sign, I'll send the invoice for the first 50% (£425).

2. **Content Planning**: I'll send a content questionnaire by January 2nd. This will help us gather all the information we need for the feature article.

3. **Photo Shoot**: Let's schedule this for the week of January 13th. I'll bring our photographer. Plan for 2-3 hours.

4. **Interview**: We can do this the same day as the photo shoot, or separately if you prefer.

5. **Wine Tasting Event**: I'll create a dedicated event page on our website and start promoting it from February 1st. We'll need final menu details by January 25th.

**Timeline:**
- Dec 20: Sign agreement
- Dec 27: First payment due
- Jan 2: Content questionnaire sent
- Jan 13-17: Photo shoot & interview
- Jan 25: Wine tasting menu finalized
- Jan 31: Second payment due
- Feb 1: Event promotion begins
- Feb 10: Feature article published
- Feb 14: Wine tasting event!

Does this work for you? And congratulations on making this happen - I have a really good feeling about this partnership!

Best,
Bridget
`;

interface TestResult {
  testName: string;
  success: boolean;
  duration: number;
  error?: string;
  entriesCount?: number;
  details?: string;
}

async function runTest(
  testName: string,
  text: string,
  shouldSplit: boolean
): Promise<TestResult> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Running: ${testName}`);
  console.log(`${'='.repeat(60)}`);

  const startTime = Date.now();

  try {
    const result = await formatCorrespondence(text, shouldSplit);
    const duration = Date.now() - startTime;

    if (!result.success) {
      return {
        testName,
        success: false,
        duration,
        error: result.error,
      };
    }

    const entriesCount = 'entries' in result.data ? result.data.entries.length : 1;

    console.log(`✅ SUCCESS`);
    console.log(`Duration: ${duration}ms`);
    console.log(`Entries: ${entriesCount}`);

    if ('entries' in result.data) {
      console.log('\nEntries:');
      result.data.entries.forEach((entry, i) => {
        console.log(`  ${i + 1}. ${entry.subject_guess}`);
        console.log(`     Date: ${entry.entry_date_guess || 'N/A'}`);
        console.log(`     Direction: ${entry.direction_guess || 'N/A'}`);
        if (entry.extracted_names) {
          console.log(`     From: ${entry.extracted_names.sender || 'N/A'}`);
          console.log(`     To: ${entry.extracted_names.recipient || 'N/A'}`);
        }
      });
    } else {
      console.log(`\nSubject: ${result.data.subject_guess}`);
      console.log(`Type: ${result.data.entry_type_guess}`);
      console.log(`Date: ${result.data.entry_date_guess || 'N/A'}`);
    }

    return {
      testName,
      success: true,
      duration,
      entriesCount,
      details: `Formatted ${entriesCount} ${entriesCount === 1 ? 'entry' : 'entries'}`,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';

    console.log(`❌ FAILED`);
    console.log(`Error: ${errorMsg}`);

    return {
      testName,
      success: false,
      duration,
      error: errorMsg,
    };
  }
}

async function main() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║     AI FORMATTING TEST SUITE - STRUCTURED OUTPUTS         ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');
  console.log('\nThis test verifies the fix for JSON parsing errors.\n');

  const results: TestResult[] = [];

  // Test 1: Simple email (baseline)
  results.push(await runTest('Test 1: Simple Email (Baseline)', simpleEmail, false));

  // Test 2: Medium thread (5 emails)
  results.push(await runTest('Test 2: Medium Thread (5 emails)', mediumThread, true));

  // Test 3: Large thread (10+ emails, ~13KB) - The problematic case
  results.push(
    await runTest(
      'Test 3: Large Thread (10+ emails, ~13KB) - CRITICAL TEST',
      largeThread,
      true
    )
  );

  // Summary
  console.log('\n\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║                      TEST SUMMARY                         ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  const passed = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  results.forEach((result) => {
    const status = result.success ? '✅ PASS' : '❌ FAIL';
    const timing = `${result.duration}ms`;
    console.log(`${status} - ${result.testName} (${timing})`);

    if (result.success && result.details) {
      console.log(`       ${result.details}`);
    }

    if (!result.success && result.error) {
      console.log(`       Error: ${result.error}`);
    }
  });

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`Total: ${results.length} | Passed: ${passed} | Failed: ${failed}`);
  console.log(`Success Rate: ${Math.round((passed / results.length) * 100)}%`);
  console.log(`${'─'.repeat(60)}\n`);

  if (failed === 0) {
    console.log('🎉 ALL TESTS PASSED! 🎉');
    console.log('\n✅ The structured outputs fix is working correctly.');
    console.log('✅ No JSON parsing errors detected.');
    console.log('✅ Large threads (13KB+) are formatting successfully.\n');
  } else {
    console.log('⚠️  SOME TESTS FAILED');
    console.log('\nPlease review the errors above and check:');
    console.log('1. ANTHROPIC_API_KEY is set correctly');
    console.log('2. API has access to structured outputs beta');
    console.log('3. Network connectivity to Anthropic API\n');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Test suite failed to run:', error);
  process.exit(1);
});
