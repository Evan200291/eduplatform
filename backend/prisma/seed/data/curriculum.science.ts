// ─────────────────────────────────────────────────────────────────────────────
// Curriculum data — Science, Years 3 to 5
// Two units per year group, chosen so the demo has both a physical-science and a
// life-science strand to report against.
// ─────────────────────────────────────────────────────────────────────────────

import { DifficultyBand } from '@prisma/client';

import type { ProgramSpec } from './curriculum.types';

const YEAR_3: ProgramSpec = {
  subjectKey: 'science',
  gradeKey: 'year-3',
  key: 'science-y3',
  name: 'Science — Year 3',
  framework: 'England KS2 Science',
  description: 'Forces you can feel, and the plants on the classroom windowsill.',
  units: [
    {
      key: 'forces-and-magnets',
      name: 'Forces and magnets',
      description: 'Contact and non-contact forces, tested rather than described.',
      topics: [
        {
          key: 'how-magnets-attract',
          name: 'How magnets attract and repel',
          description: 'Poles, attraction, repulsion and magnetic materials.',
          minutes: 30,
          band: DifficultyBand.FOUNDATION,
          objectives: [
            ['S3.1a', 'Describe magnets as having two poles that attract or repel.'],
            ['S3.1b', 'Predict whether two magnets will attract or repel from their poles.'],
          ],
        },
        {
          key: 'friction-on-surfaces',
          name: 'Friction on different surfaces',
          description: 'Compare how things move on smooth and rough surfaces.',
          minutes: 30,
          band: DifficultyBand.DEVELOPING,
          objectives: [
            ['S3.2a', 'Compare how things move on different surfaces.'],
            ['S3.2b', 'Set up a fair test to compare two surfaces.'],
          ],
        },
      ],
    },
    {
      key: 'plants',
      name: 'Plants',
      description: 'Structure and requirements for growth.',
      topics: [
        {
          key: 'parts-of-a-plant',
          name: 'Parts of a plant',
          description: 'Roots, stem, leaves and flower, and what each one does.',
          minutes: 25,
          band: DifficultyBand.FOUNDATION,
          objectives: [
            ['S3.3a', 'Identify the parts of a flowering plant.'],
            ['S3.3b', 'Describe the function of the roots, stem, leaves and flower.'],
          ],
        },
        {
          key: 'what-plants-need',
          name: 'What plants need to grow',
          description: 'Light, water, air, nutrients and room to grow.',
          minutes: 30,
          band: DifficultyBand.DEVELOPING,
          objectives: [
            ['S3.4a', 'Explore the requirements of plants for life and growth.'],
            ['S3.4b', 'Record the results of a growth investigation over two weeks.'],
          ],
        },
      ],
    },
  ],
};

const YEAR_4: ProgramSpec = {
  subjectKey: 'science',
  gradeKey: 'year-4',
  key: 'science-y4',
  name: 'Science — Year 4',
  framework: 'England KS2 Science',
  description: 'Matter changing state, and sound as something that travels.',
  units: [
    {
      key: 'states-of-matter',
      name: 'States of matter',
      description: 'Solids, liquids, gases and the changes between them.',
      topics: [
        {
          key: 'solids-liquids-gases',
          name: 'Solids, liquids and gases',
          description: 'Group materials by state and justify the grouping.',
          minutes: 30,
          band: DifficultyBand.FOUNDATION,
          objectives: [
            ['S4.1a', 'Compare and group materials as solids, liquids or gases.'],
            ['S4.1b', 'Explain how a material changes state when heated or cooled.'],
          ],
        },
        {
          key: 'evaporation-condensation',
          name: 'Evaporation and condensation',
          description: 'The water cycle, observed in a classroom investigation.',
          minutes: 30,
          band: DifficultyBand.DEVELOPING,
          objectives: [
            ['S4.2a', 'Identify the part played by evaporation and condensation in the water cycle.'],
            ['S4.2b', 'Associate the rate of evaporation with temperature.'],
          ],
        },
      ],
    },
    {
      key: 'sound',
      name: 'Sound',
      description: 'Vibration, travel through a medium, pitch and volume.',
      topics: [
        {
          key: 'how-sound-travels',
          name: 'How sound travels',
          description: 'Vibrations moving through solids, liquids and gases to the ear.',
          minutes: 30,
          band: DifficultyBand.DEVELOPING,
          objectives: [
            ['S4.3a', 'Identify how sounds are made, associating them with vibration.'],
            ['S4.3b', 'Recognise that sound gets fainter as distance from the source increases.'],
          ],
        },
        {
          key: 'pitch-and-volume',
          name: 'Pitch and volume',
          description: 'Link pitch to the features of the source and volume to strength.',
          minutes: 25,
          band: DifficultyBand.SECURE,
          objectives: [
            ['S4.4a', 'Find patterns between the pitch of a sound and features of the object.'],
            ['S4.4b', 'Find patterns between the volume of a sound and the strength of the vibration.'],
          ],
        },
      ],
    },
  ],
};

const YEAR_5: ProgramSpec = {
  subjectKey: 'science',
  gradeKey: 'year-5',
  key: 'science-y5',
  name: 'Science — Year 5',
  framework: 'England KS2 Science',
  description: 'The solar system, and materials chosen for what they do.',
  units: [
    {
      key: 'earth-and-space',
      name: 'Earth and space',
      description: 'Orbits, rotation, and the everyday consequences of both.',
      topics: [
        {
          key: 'planets-and-orbits',
          name: 'Planets and orbits',
          description: 'The Sun, the planets and the shape of their orbits.',
          minutes: 30,
          band: DifficultyBand.DEVELOPING,
          objectives: [
            ['S5.1a', 'Describe the movement of the Earth and other planets relative to the Sun.'],
            ['S5.1b', 'Describe the Sun, Earth and Moon as approximately spherical bodies.'],
          ],
        },
        {
          key: 'day-and-night',
          name: 'Day and night',
          description: 'Rotation explains apparent movement of the Sun across the sky.',
          minutes: 25,
          band: DifficultyBand.SECURE,
          objectives: [
            ['S5.2a', 'Use the idea of the Earth’s rotation to explain day and night.'],
            ['S5.2b', 'Explain the apparent movement of the Sun across the sky.'],
          ],
        },
      ],
    },
    {
      key: 'properties-of-materials',
      name: 'Properties and changes of materials',
      description: 'Separating mixtures, and telling reversible from irreversible change.',
      topics: [
        {
          key: 'separating-mixtures',
          name: 'Separating mixtures',
          description: 'Filtering, sieving and evaporating, chosen to suit the mixture.',
          minutes: 35,
          band: DifficultyBand.SECURE,
          objectives: [
            ['S5.3a', 'Use filtering, sieving and evaporating to separate mixtures.'],
            ['S5.3b', 'Justify the choice of a separation method for a given mixture.'],
          ],
        },
        {
          key: 'reversible-changes',
          name: 'Reversible and irreversible changes',
          description: 'Dissolving and melting against burning and rusting.',
          minutes: 30,
          band: DifficultyBand.CHALLENGE,
          objectives: [
            ['S5.4a', 'Demonstrate that dissolving, mixing and changes of state are reversible.'],
            ['S5.4b', 'Explain that burning and the action of acid on bicarbonate are not reversible.'],
          ],
        },
      ],
    },
  ],
};

export const SCIENCE_PROGRAMS: readonly ProgramSpec[] = [YEAR_3, YEAR_4, YEAR_5];
