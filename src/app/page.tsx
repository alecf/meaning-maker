"use client";
import { EmbedResponse, SentenceInfo } from "@/types";
import { Link } from "@chakra-ui/next-js";
import {
  Box,
  Button,
  Container,
  Flex,
  Heading,
  NumberDecrementStepper,
  NumberIncrementStepper,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  Spinner,
  Text,
  Textarea,
  Tooltip,
} from "@chakra-ui/react";
import { scalePow } from "d3-scale";
import { Inter } from "next/font/google";
import { useState } from "react";
import useSWRMutation from "swr/mutation";

const inter = Inter({ subsets: ["latin"] });

export default function Home() {
  const [input, setInput] = useState("");
  const [windowSize, setWindowSize] = useState("8");
  const { trigger, data, isMutating, error } = useSWRMutation(
    "embedded",
    async () => {
      // Wikipedia references confuse the splitter
      const inputWithWikiReferencesFixed = input.replace(
        /\.(\[[0-9]+\])/g,
        ". $1",
      );
      const response = await fetch(`/api/embeddoc?window_size=${windowSize}`, {
        body: encodeURIComponent(inputWithWikiReferencesFixed),
        method: "POST",
      });
      const r: EmbedResponse = await response.json();
      return r;
    },
  );

  let min = 1;
  let max = 0;
  for (const paragraph of data?.response ?? []) {
    const [pMin, pMax] = getDistanceRange(paragraph);
    min = Math.min(min, pMin);
    max = Math.max(max, pMax);
  }
  const opacityScale = scalePow()
    .exponent(50)
    .domain([max, min])
    .range([0.1, 1])
    .clamp(true);
  return (
    <Box as="main">
      <Container centerContent width={{ base: "md", md: "2xl" }} p={4} gap={2}>
        <Heading>Meaning Maker</Heading>
        <Text paddingY={2} textAlign="center" sx={{ textWrap: "balance" }}>
          Enter text to try to gauge how much new information there is in each
          sentence. (max 3000 characters)
        </Text>

        <Textarea
          bgColor="whiteAlpha.500"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          maxLength={3000}
        />
        <Text sx={{ textWrap: "balance" }} fontSize="sm">
          Need inspiration? Try part of a{" "}
          <Link
            href="https://en.wikipedia.org/wiki/Special:Random"
            target="_blank"
            textDecoration="underline"
          >
            random Wikipedia page
          </Link>{" "}
          or enter your own text.
        </Text>

        <Flex gap={1}>
          <label>
            <Flex gap={1} alignItems="center">
              <Text>Window size:</Text>
              <NumberInput
                size="sm"
                bgColor="whiteAlpha.500"
                value={windowSize}
                onChange={(valueStr) => setWindowSize(valueStr)}
                max={10}
              >
                <NumberInputField />
                <NumberInputStepper>
                  <NumberIncrementStepper />
                  <NumberDecrementStepper />
                </NumberInputStepper>
              </NumberInput>
            </Flex>
          </label>
          <Button
            onClick={() => trigger()}
            isLoading={isMutating}
            isDisabled={isMutating || !input.trim()}
            rightIcon={isMutating ? <Spinner /> : undefined}
          >
            Submit
          </Button>
        </Flex>
        {error && <Text color="red.500">{error.message}</Text>}
        <div>
          {data?.response.map((paragraph, index) => {
            const prevParagraph: SentenceInfo[] =
              index === 0 ? [] : data?.response[index - 1];
            return (
              <Text paddingTop={2} key={index}>
                {paragraph.map((sentence, sIndex) => {
                  const prevSentence =
                    sIndex === 0
                      ? prevParagraph[prevParagraph.length - 1]
                      : paragraph[sIndex - 1];
                  const diff = prevSentence
                    ? sentence.distance - prevSentence.distance
                    : 0;
                  const isFirst = index === 0 && sIndex === 0;
                  const opacity = isFirst ? 1 : opacityScale(sentence.distance);

                  return (
                    <Tooltip
                      key={sIndex}
                      label={`distance: ${sentence.distance.toFixed(
                        3,
                      )} (${formatDiff(diff)})`}
                      hasArrow
                      placement="left-start"
                    >
                      <Text
                        as="span"
                        data-distance={sentence.distance}
                        _hover={{
                          textShadow: `0px 0px 1px hsla(from var(--chakra-colors-chakra-body-text) h s l / 1)`,
                        }}
                        sx={{
                          opacity: `${opacity}`,
                          paddingLeft: "2px",
                        }}
                      >
                        {sentence.sentence}{" "}
                      </Text>
                    </Tooltip>
                  );
                })}
              </Text>
            );
          })}
        </div>
      </Container>
    </Box>
  );
}

function formatDiff(diff: number) {
  return diff > 0 ? `+${diff.toFixed(3)}` : `${diff.toFixed(3)}`;
}

function getDistanceRange(sentences: SentenceInfo[]) {
  const distances = sentences
    .map(({ distance }) => distance)
    .filter((distance) => distance);
  const min = Math.min(...distances);
  const max = Math.max(...distances);
  return [min, max];
}

function getPercentThroughRange(min: number, max: number, value: number) {
  const range = max - min;
  const valueInRange = value - min;
  return Math.max(valueInRange / range, 0);
}
