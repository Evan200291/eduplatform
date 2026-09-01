// ─────────────────────────────────────────────────────────────────────────────
// Question bank — English, Years 3 to 5
// Reading questions quote a short extract inside the prompt so the item is
// self-contained: no separate reading booklet is needed to answer it.
// ─────────────────────────────────────────────────────────────────────────────

import { QuestionType } from '@prisma/client';

import type { QuestionBank } from './questions.types';

export const ENGLISH_QUESTIONS: QuestionBank = {
  'english-y3:retrieval-and-inference': [
    {
      type: QuestionType.MULTIPLE_CHOICE,
      prompt:
        'Read this: "Mia pulled her coat tight and hurried past the bus stop, glancing at the sky." What can you infer about the weather?',
      explanation: 'Pulling a coat tight and glancing at the sky suggests cold, and possibly rain.',
      objective: 1,
      hint: 'The text never says the weather. What are the clues?',
      options: [
        ['It is cold and might rain', true, 'Correct — the coat and the glance at the sky are the clues.'],
        ['It is hot and sunny', false, 'She would not pull her coat tight in the heat.'],
        ['It is snowing heavily', false, 'Nothing in the text mentions snow.'],
        ['The text tells us it is windy', false, 'The text does not say this — we have to infer.'],
      ],
    },
    {
      type: QuestionType.SHORT_TEXT,
      prompt:
        'Read this: "The library closes at four o\'clock on Saturdays." What time does the library close on Saturdays?',
      explanation: 'This is retrieval: the answer is stated directly in the sentence.',
      objective: 0,
      hint: 'Find the words that answer "what time".',
      text: ['four', "four o'clock", '4', '4pm', '4 pm'],
    },
    {
      type: QuestionType.TRUE_FALSE,
      prompt: 'True or false: an inference must be supported by evidence from the text.',
      explanation: 'An inference is a fair conclusion drawn from clues in the text, not a guess.',
      objective: 1,
      hint: 'Could you point to the words that made you think it?',
      boolean: true,
    },
  ],
  'english-y3:vocabulary-in-context': [
    {
      type: QuestionType.MULTIPLE_CHOICE,
      prompt:
        'Read this: "The path was treacherous after the rain, so we walked slowly." What does "treacherous" mean here?',
      explanation: 'Walking slowly after rain suggests the path was dangerous or slippery.',
      objective: 0,
      hint: 'Why would they walk slowly?',
      options: [
        ['Dangerous', true, 'Correct — the rest of the sentence gives the clue.'],
        ['Beautiful', false, 'That would not explain walking slowly.'],
        ['Narrow', false, 'Possible, but the rain points to danger rather than width.'],
        ['Quiet', false, 'Nothing in the sentence is about sound.'],
      ],
    },
    {
      type: QuestionType.MULTIPLE_CHOICE,
      prompt: 'Which word would best replace "said" in: "Stop!" she said as the ball rolled into the road.',
      explanation: 'The situation is urgent, so a stronger word such as "shouted" fits better.',
      objective: 1,
      hint: 'How would you say it if the ball were rolling into a road?',
      options: [
        ['shouted', true, 'Correct — it matches the urgency.'],
        ['whispered', false, 'Too quiet for a warning.'],
        ['mumbled', false, 'That would not be heard in time.'],
        ['asked', false, 'This is a warning, not a question.'],
      ],
    },
    {
      type: QuestionType.TRUE_FALSE,
      prompt: 'True or false: you can often work out a new word from the words around it.',
      explanation: 'The surrounding words — the context — usually narrow the meaning down.',
      objective: 0,
      hint: 'Think about how you worked out "treacherous".',
      boolean: true,
    },
  ],
  'english-y3:sentence-punctuation': [
    {
      type: QuestionType.MULTIPLE_CHOICE,
      prompt: 'Which sentence is punctuated correctly?',
      explanation: 'A statement needs a capital letter at the start and a full stop at the end.',
      objective: 0,
      hint: 'Check the first letter and the final mark.',
      options: [
        ['We fed the ducks by the pond.', true, 'Correct — capital letter and full stop.'],
        ['we fed the ducks by the pond.', false, 'The first word needs a capital letter.'],
        ['We fed the ducks by the pond', false, 'The full stop is missing.'],
        ['We fed the ducks by the pond?', false, 'This is a statement, not a question.'],
      ],
    },
    {
      type: QuestionType.MULTIPLE_CHOICE,
      prompt: 'Which sentence punctuates the speech correctly?',
      explanation: 'The spoken words sit inside inverted commas, and the punctuation goes inside them too.',
      objective: 1,
      hint: 'Where do the spoken words start and stop?',
      options: [
        ['"Come inside," called Dad.', true, 'Correct — comma inside the inverted commas.'],
        ['"Come inside" called Dad.', false, 'A comma is needed before the closing mark.'],
        ['Come inside, "called Dad."', false, 'The inverted commas are around the wrong words.'],
        ['"come inside," called Dad.', false, 'Speech begins with a capital letter.'],
      ],
    },
    {
      type: QuestionType.TRUE_FALSE,
      prompt: 'True or false: an exclamation mark can end a sentence that shows strong feeling.',
      explanation: 'Exclamation marks mark surprise, urgency or strong feeling.',
      objective: 0,
      hint: 'Think of "Watch out!"',
      boolean: true,
    },
  ],
  'english-y3:paragraphs-and-cohesion': [
    {
      type: QuestionType.MULTIPLE_CHOICE,
      prompt: 'When should a writer start a new paragraph?',
      explanation: 'A new paragraph signals a change of time, place, topic or speaker.',
      objective: 0,
      hint: 'Think about what has changed for the reader.',
      options: [
        ['When the time, place or topic changes', true, 'Correct — the reader needs that signal.'],
        ['Every three sentences', false, 'Paragraph length depends on meaning, not counting.'],
        ['Whenever the line is full', false, 'That is just the edge of the page.'],
        ['Only at the end of a story', false, 'That would leave one long block of text.'],
      ],
    },
    {
      type: QuestionType.MULTIPLE_CHOICE,
      prompt: 'Choose the best word: "We could not go outside ____ it was raining."',
      explanation: '"Because" explains the cause, which is what the sentence needs.',
      objective: 1,
      hint: 'Which word explains why?',
      options: [
        ['because', true, 'Correct — it gives the reason.'],
        ['although', false, 'That would contrast the two ideas instead.'],
        ['before', false, 'That would be about time, not reason.'],
        ['unless', false, 'That would set a condition.'],
      ],
    },
    {
      type: QuestionType.SHORT_TEXT,
      prompt: 'Write one word that could open a paragraph describing what happened next.',
      explanation: 'Time words such as "later", "afterwards" or "then" move the reader forward.',
      objective: 1,
      hint: 'Think of a time word.',
      text: ['later', 'afterwards', 'then', 'next', 'soon', 'eventually', 'finally'],
    },
  ],
  'english-y4:summarising-texts': [
    {
      type: QuestionType.MULTIPLE_CHOICE,
      prompt:
        'A paragraph describes how bees find flowers, how they carry pollen, and how they return to the hive. What is its main idea?',
      explanation: 'All three details are about how bees collect and carry pollen.',
      objective: 0,
      hint: 'What do all the details have in common?',
      options: [
        ['How bees collect pollen', true, 'Correct — that is what every detail supports.'],
        ['Why hives are warm', false, 'The paragraph does not mention hive temperature.'],
        ['That bees can sting', false, 'Not mentioned at all.'],
        ['How flowers grow', false, 'Flowers appear, but they are not the focus.'],
      ],
    },
    {
      type: QuestionType.TRUE_FALSE,
      prompt: 'True or false: a good summary keeps every example from the original text.',
      explanation: 'A summary keeps the main ideas and leaves the examples out.',
      objective: 1,
      hint: 'What makes a summary shorter than the text?',
      boolean: false,
    },
    {
      type: QuestionType.SHORT_TEXT,
      prompt: 'In one word, what do we call a short version of a text that keeps only the main ideas?',
      explanation: 'That is a summary.',
      objective: 1,
      hint: 'It starts with "s".',
      text: ['summary', 'a summary'],
    },
  ],
  'english-y4:authors-word-choice': [
    {
      type: QuestionType.MULTIPLE_CHOICE,
      prompt: 'Why might a writer choose "crept" instead of "walked"?',
      explanation: '"Crept" suggests slow, quiet, careful movement, which builds tension.',
      objective: 1,
      hint: 'Picture each word. Which one is quieter?',
      options: [
        ['To suggest quiet, careful movement', true, 'Correct — it adds tension.'],
        ['To make the sentence longer', false, 'Both words are short.'],
        ['Because "walked" is incorrect', false, '"Walked" is fine, just less precise.'],
        ['To show the character was running', false, 'Creeping is slow, not fast.'],
      ],
    },
    {
      type: QuestionType.MULTIPLE_CHOICE,
      prompt: 'Which phrase creates the gloomiest mood?',
      explanation: '"Grey drizzle smeared the windows" uses dull colour and a heavy verb.',
      objective: 0,
      hint: 'Look at both the colour word and the verb.',
      options: [
        ['Grey drizzle smeared the windows', true, 'Correct — dull colour, heavy verb.'],
        ['Rain fell on the windows', false, 'Accurate, but neutral.'],
        ['Bright drops danced on the glass', false, 'That sounds cheerful.'],
        ['The windows were wet', false, 'A plain statement with no mood.'],
      ],
    },
    {
      type: QuestionType.TRUE_FALSE,
      prompt: 'True or false: word choice can change how a reader feels about a character.',
      explanation: 'Precise verbs and adjectives shape the reader’s impression.',
      objective: 1,
      hint: 'Compare "smiled" with "smirked".',
      boolean: true,
    },
  ],
  'english-y4:fronted-adverbials': [
    {
      type: QuestionType.MULTIPLE_CHOICE,
      prompt: 'Which sentence opens with a fronted adverbial?',
      explanation: 'A fronted adverbial comes before the main clause and is followed by a comma.',
      objective: 0,
      hint: 'Look for extra information before the subject of the sentence.',
      options: [
        ['Later that evening, the lights went out.', true, 'Correct — it tells us when, and it is fronted.'],
        ['The lights went out later that evening.', false, 'Correct English, but the adverbial is at the end.'],
        ['The lights, later that evening, went out.', false, 'Here it is embedded, not fronted.'],
        ['Went out the lights later.', false, 'The word order is muddled.'],
      ],
    },
    {
      type: QuestionType.MULTIPLE_CHOICE,
      prompt: 'Where does the comma go?  "Without a sound the fox slipped away."',
      explanation: 'The comma follows the fronted adverbial: "Without a sound, the fox slipped away."',
      objective: 1,
      hint: 'The comma marks the end of the opening phrase.',
      options: [
        ['After "sound"', true, 'Correct — it closes the fronted adverbial.'],
        ['After "fox"', false, 'That would split the subject from its verb.'],
        ['After "Without"', false, 'The phrase is not finished yet.'],
        ['No comma is needed', false, 'A fronted adverbial is followed by a comma.'],
      ],
    },
    {
      type: QuestionType.SHORT_TEXT,
      prompt: 'Write a two-word fronted adverbial that tells the reader when something happened.',
      explanation: 'Phrases such as "Last night" or "Every morning" answer "when".',
      objective: 0,
      hint: 'Think of two words that name a time.',
      text: [
        'last night',
        'every morning',
        'this morning',
        'last week',
        'that evening',
        'every day',
        'next day',
      ],
    },
  ],
  'english-y4:editing-and-proofreading': [
    {
      type: QuestionType.MULTIPLE_CHOICE,
      prompt: 'Which correction does this sentence need?  "we went to the park on saturday"',
      explanation: '"We" and "Saturday" both need capital letters, and the sentence needs a full stop.',
      objective: 0,
      hint: 'Check the first word, the day name, and the ending.',
      options: [
        ['Capital letters and a full stop', true, 'Correct — three fixes in one short sentence.'],
        ['A question mark', false, 'It is a statement, not a question.'],
        ['Nothing at all', false, 'Two capitals and a full stop are missing.'],
        ['Inverted commas', false, 'Nobody is speaking.'],
      ],
    },
    {
      type: QuestionType.MULTIPLE_CHOICE,
      prompt:
        'Improve this: "The dog was big. The dog was loud. The dog was friendly." What is the best edit?',
      explanation: 'Combining the three short sentences removes the repetition of "The dog was".',
      objective: 1,
      hint: 'What is repeated three times?',
      options: [
        ['The big, loud dog was friendly.', true, 'Correct — one sentence, no repetition.'],
        ['The dog was big, loud and the dog was friendly.', false, 'Still repeats "the dog was".'],
        ['Big. Loud. Friendly.', false, 'None of these are full sentences.'],
        ['Leave it as it is.', false, 'The repetition makes it clumsy to read.'],
      ],
    },
    {
      type: QuestionType.TRUE_FALSE,
      prompt: 'True or false: proofreading is best done straight after writing, without rereading.',
      explanation: 'Proofreading means rereading deliberately, ideally after a short break.',
      objective: 0,
      hint: 'What does "proofread" ask you to do?',
      boolean: false,
    },
  ],
  'english-y5:comparing-texts': [
    {
      type: QuestionType.MULTIPLE_CHOICE,
      prompt:
        'One article calls the new bypass "a lifeline for the town"; another calls it "concrete across our fields". What differs?',
      explanation: 'Both describe the same road, but each writer’s viewpoint is different.',
      objective: 0,
      hint: 'Are they describing different things, or the same thing differently?',
      options: [
        ['Their viewpoint', true, 'Correct — the subject is the same, the attitude is not.'],
        ['The subject', false, 'Both are about the same bypass.'],
        ['The audience’s age', false, 'Nothing tells us who each was written for.'],
        ['The number of facts', false, 'Neither extract gives facts.'],
      ],
    },
    {
      type: QuestionType.TRUE_FALSE,
      prompt: 'True or false: a comparison is stronger when each point is supported by a quotation.',
      explanation: 'A short quotation shows the reader exactly what led to your conclusion.',
      objective: 1,
      hint: 'How does a reader know you are right?',
      boolean: true,
    },
    {
      type: QuestionType.MULTIPLE_CHOICE,
      prompt: 'Which sentence opener is best for a comparison?',
      explanation: '"Whereas" signals a contrast between two texts.',
      objective: 1,
      hint: 'Which word sets two ideas against each other?',
      options: [
        ['Whereas the first article…', true, 'Correct — it signals contrast.'],
        ['Firstly, the article…', false, 'That signals a list, not a comparison.'],
        ['In conclusion…', false, 'That belongs at the end.'],
        ['For example…', false, 'That introduces evidence, not contrast.'],
      ],
    },
  ],
  'english-y5:figurative-language': [
    {
      type: QuestionType.MULTIPLE_CHOICE,
      prompt: 'What kind of figurative language is "the wind howled all night"?',
      explanation: 'The wind is given a human or animal action, so this is personification.',
      objective: 0,
      hint: 'Who or what usually howls?',
      options: [
        ['Personification', true, 'Correct — the wind is described as if alive.'],
        ['Simile', false, 'A simile would use "like" or "as".'],
        ['Metaphor', false, 'Close, but nothing is being called something else.'],
        ['Alliteration', false, 'That is repeated initial sounds.'],
      ],
    },
    {
      type: QuestionType.MULTIPLE_CHOICE,
      prompt: 'Which one is a simile?',
      explanation: 'A simile compares using "like" or "as".',
      objective: 0,
      hint: 'Look for the comparing word.',
      options: [
        ['Her hands were as cold as stone', true, 'Correct — it compares using "as".'],
        ['Her hands were blocks of ice', false, 'That is a metaphor.'],
        ['The ice cracked loudly', false, 'That is literal description.'],
        ['Cold crept along the corridor', false, 'That is personification.'],
      ],
    },
    {
      type: QuestionType.SHORT_TEXT,
      prompt: 'What image does the metaphor "a blanket of snow" create? Answer in one or two words.',
      explanation: 'It suggests snow covering everything smoothly and warmly, like a blanket.',
      objective: 1,
      hint: 'What does a blanket do?',
      text: ['covering', 'cover', 'covered', 'covering everything', 'warmth', 'smooth cover'],
    },
  ],
  'english-y5:relative-clauses': [
    {
      type: QuestionType.MULTIPLE_CHOICE,
      prompt: 'Choose the correct relative pronoun: "The teacher ____ marked our books is away today."',
      explanation: '"Who" is used for people.',
      objective: 0,
      hint: 'Is the sentence about a person, a thing or a place?',
      options: [
        ['who', true, 'Correct — "who" refers to people.'],
        ['which', false, '"Which" is for things.'],
        ['where', false, '"Where" is for places.'],
        ['when', false, '"When" is for time.'],
      ],
    },
    {
      type: QuestionType.MULTIPLE_CHOICE,
      prompt: 'Which sentence punctuates the parenthesis correctly?',
      explanation: 'A pair of commas — or brackets — must open and close the extra information.',
      objective: 1,
      hint: 'Extra information needs marks at both ends.',
      options: [
        ['My cousin, who lives in Leeds, is visiting.', true, 'Correct — a comma at each end.'],
        ['My cousin who lives in Leeds, is visiting.', false, 'The opening comma is missing.'],
        ['My cousin, who lives in Leeds is visiting.', false, 'The closing comma is missing.'],
        ['My cousin (who lives in Leeds is visiting).', false, 'The bracket closes in the wrong place.'],
      ],
    },
    {
      type: QuestionType.TRUE_FALSE,
      prompt: 'True or false: a relative clause adds detail about a noun already in the sentence.',
      explanation: 'That is exactly what it does — it modifies a noun.',
      objective: 0,
      hint: 'What does the clause tell you more about?',
      boolean: true,
    },
  ],
  'english-y5:planning-narrative': [
    {
      type: QuestionType.MULTIPLE_CHOICE,
      prompt: 'You are planning a story. Which note belongs in the "build-up" section of the plan?',
      explanation: 'The build-up raises tension after the opening but before the problem peaks.',
      objective: 0,
      hint: 'Which note makes the reader worry that something is coming?',
      options: [
        ['The lights flicker and Mia hears footsteps upstairs.', true, 'Correct — tension is rising.'],
        ['Mia lives in a tall house near the river.', false, 'That is setting — it belongs in the opening.'],
        ['Mia finally mends the broken clock.', false, 'That is the resolution.'],
        ['The ceiling gives way and Mia falls.', false, 'That is the climax, not the build-up.'],
      ],
    },
    {
      type: QuestionType.MULTIPLE_CHOICE,
      prompt: 'A planning grid has the headings: Opening, Build-up, ____, Resolution. What is missing?',
      explanation: 'The problem (or climax) is the turning point of the narrative.',
      objective: 1,
      hint: 'Something has to go wrong before it can be put right.',
      options: [
        ['Problem', true, 'Correct — the problem sits between build-up and resolution.'],
        ['Glossary', false, 'A glossary belongs in non-fiction.'],
        ['Bibliography', false, 'That is for research writing.'],
        ['Sub-heading', false, 'Sub-headings organise information texts, not story plans.'],
      ],
    },
    {
      type: QuestionType.SHORT_TEXT,
      prompt: 'One word: what do we call the person who tells the story?',
      explanation: 'The narrator tells the story; the narrator may or may not be a character.',
      objective: 0,
      hint: 'It comes from the word "narrate".',
      text: ['narrator', 'the narrator'],
    },
  ],
};
