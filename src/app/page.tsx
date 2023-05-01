"use client";
import { EmbedResponse, SentenceInfo } from "@/types";
import {
  Button,
  Container,
  Flex,
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
  const { trigger, data, isMutating } = useSWRMutation("embedded", async () => {
    // Wikipedia references confuse the splitter
    const inputWithWikiReferencesFixed = input.replace(
      /\.(\[[0-9]+\])/g,
      ". $1"
    );
    const response = await fetch(`/api/embeddoc?window_size=${windowSize}`, {
      body: inputWithWikiReferencesFixed,
      method: "POST",
    });
    const r: EmbedResponse = await response.json();
    return r;
  });

  let min = 0;
  let max = 0;
  for (const paragraph of data?.response ?? []) {
    const [pMin, pMax] = getDistanceRange(paragraph);
    min = Math.min(min, pMin);
    max = Math.max(max, pMax);
    console.log("ranging from ", pMin, max);
    console.log("data = ", data?.response);
  }
  const opacityScale = scalePow()
    .exponent(50)
    .domain([max, min])
    .range([0.1, 1])
    .clamp(true);
  return (
    <main>
      <Container centerContent width="2xl">
        <Text as="h1">Enter text</Text>

        <Textarea value={input} onChange={(e) => setInput(e.target.value)} />
        <Flex gap={1}>
          <label>
            <Flex gap={1} alignItems="center">
              <Text>Window size:</Text>
              <NumberInput
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
            isDisabled={isMutating}
            rightIcon={isMutating ? <Spinner /> : undefined}
          >
            submit
          </Button>
        </Flex>
        <div className="flex-1 w-full">
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
                  const opacity =
                    sIndex === 0 ? 1 : opacityScale(sentence.distance);
                  return (
                    <Tooltip
                      key={sIndex}
                      label={`distance: ${sentence.distance} (${formatDiff(
                        diff
                      )})`}
                      hasArrow
                      placement="left-start"
                    >
                      <Text
                        as="span"
                        data-distance={sentence.distance}
                        _hover={{
                          textShadow: `0px 0px 1px rgba(0,0,0,${opacity})`,
                        }}
                        sx={{
                          color: `rgba(0,0,0,${opacity})`,
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
    </main>
  );
}

function formatDiff(diff: number) {
  return diff > 0 ? `+${diff.toFixed(2)}` : `${diff.toFixed(2)}`;
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
