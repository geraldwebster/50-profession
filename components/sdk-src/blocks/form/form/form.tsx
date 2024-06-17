import * as React from "react";
import BaseText from "../../blocks/BaseText";
import {
  FlatList,
  ScrollView,
  View,
  StyleSheet,
  Image,
  Text,
  Pressable,
} from "react-native";
import { useState, useRef } from "react";

/**
 * This import is used by the Svelte SDK. Do not remove.
 */

export type FormProps = BuilderDataProps &
  BuilderComponentsProp &
  BuilderLinkComponentProp & {
    attributes?: any;
    name?: string;
    action?: string;
    validate?: boolean;
    method?: string;
    sendSubmissionsTo?: string;
    sendSubmissionsToEmail?: string;
    sendWithJs?: boolean;
    contentType?: string;
    customHeaders?: {
      [key: string]: string;
    };
    successUrl?: string;
    previewState?: FormState;
    successMessage?: BuilderBlock[];
    errorMessage?: BuilderBlock[];
    sendingMessage?: BuilderBlock[];
    resetFormOnSubmit?: boolean;
    errorMessagePath?: string;
  };
/**
 * This import is used by the Svelte SDK. Do not remove.
 */

export type FormState = "unsubmitted" | "sending" | "success" | "error";
import Block from "../../../components/block/block";
import Blocks from "../../../components/blocks/blocks";
import { getEnv } from "../../../functions/get-env";
import { get } from "../../../functions/get";
import { isEditing } from "../../../functions/is-editing";
import { set } from "../../../functions/set";
import type { BuilderBlock } from "../../../types/builder-block";
import type {
  BuilderComponentsProp,
  BuilderDataProps,
  BuilderLinkComponentProp,
} from "../../../types/builder-props";
import type { Dictionary } from "../../../types/typescript";
import { filterAttrs } from "../../helpers";
import { setAttrs } from "../../helpers";

function FormComponent(props: FormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [formState, setFormState] = useState(() => "unsubmitted");

  const [responseData, setResponseData] = useState(() => null);

  const [formErrorMessage, setFormErrorMessage] = useState(() => "");

  function mergeNewRootState(newData: Dictionary<any>) {
    const combinedState = {
      ...props.builderContext.rootState,
      ...newData,
    };
    if (props.builderContext.rootSetState) {
      props.builderContext.rootSetState?.(combinedState);
    } else {
      props.builderContext.rootState = combinedState;
    }
  }

  function submissionState() {
    return (isEditing() && props.previewState) || formState;
  }

  function onSubmit(event: any) {
    const sendWithJsProp =
      props.sendWithJs || props.sendSubmissionsTo === "email";
    if (props.sendSubmissionsTo === "zapier") {
      event.preventDefault();
    } else if (sendWithJsProp) {
      if (!(props.action || props.sendSubmissionsTo === "email")) {
        event.preventDefault();
        return;
      }
      event.preventDefault();
      const el = event.currentTarget;
      const headers = props.customHeaders || {};
      let body: any;
      const formData = new FormData(el);

      // TODO: maybe support null
      const formPairs: {
        key: string;
        value: File | boolean | number | string | FileList;
      }[] = Array.from(
        event.currentTarget.querySelectorAll("input,select,textarea")
      )
        .filter((el) => !!(el as HTMLInputElement).name)
        .map((el) => {
          let value: any;
          const key = (el as HTMLImageElement).name;
          if (el instanceof HTMLInputElement) {
            if (el.type === "radio") {
              if (el.checked) {
                value = el.name;
                return {
                  key,
                  value,
                };
              }
            } else if (el.type === "checkbox") {
              value = el.checked;
            } else if (el.type === "number" || el.type === "range") {
              const num = el.valueAsNumber;
              if (!isNaN(num)) {
                value = num;
              }
            } else if (el.type === "file") {
              // TODO: one vs multiple files
              value = el.files;
            } else {
              value = el.value;
            }
          } else {
            value = (el as HTMLInputElement).value;
          }
          return {
            key,
            value,
          };
        });
      let formContentType = props.contentType;
      if (props.sendSubmissionsTo === "email") {
        formContentType = "multipart/form-data";
      }
      Array.from(formPairs).forEach(({ value }) => {
        if (
          value instanceof File ||
          (Array.isArray(value) && value[0] instanceof File) ||
          value instanceof FileList
        ) {
          formContentType = "multipart/form-data";
        }
      });

      // TODO: send as urlEncoded or multipart by default
      // because of ease of use and reliability in browser API
      // for encoding the form?
      if (formContentType !== "application/json") {
        body = formData;
      } else {
        // Json
        const json = {};
        Array.from(formPairs).forEach(({ value, key }) => {
          set(json, key, value);
        });
        body = JSON.stringify(json);
      }
      if (formContentType && formContentType !== "multipart/form-data") {
        if (
          /* Zapier doesn't allow content-type header to be sent from browsers */ !(
            sendWithJsProp && props.action?.includes("zapier.com")
          )
        ) {
          headers["content-type"] = formContentType;
        }
      }
      const presubmitEvent = new CustomEvent("presubmit", { detail: { body } });
      if (formRef.current) {
        formRef.current.dispatchEvent(presubmitEvent);
        if (presubmitEvent.defaultPrevented) {
          return;
        }
      }
      setFormState("sending");
      const formUrl = `${
        getEnv() === "dev" ? "http://localhost:5000" : "https://builder.io"
      }/api/v1/form-submit?apiKey=${props.builderContext.apiKey}&to=${btoa(
        props.sendSubmissionsToEmail || ""
      )}&name=${encodeURIComponent(props.name || "")}`;
      fetch(
        props.sendSubmissionsTo === "email"
          ? formUrl
          : props.action! /* TODO: throw error if no action URL */,
        { body, headers, method: props.method || "post" }
      ).then(
        async (res) => {
          let body;
          const contentType = res.headers.get("content-type");
          if (contentType && contentType.indexOf("application/json") !== -1) {
            body = await res.json();
          } else {
            body = await res.text();
          }
          if (!res.ok && props.errorMessagePath) {
            /* TODO: allow supplying an error formatter function */ let message =
              get(body, props.errorMessagePath);
            if (message) {
              if (typeof message !== "string") {
                /* TODO: ideally convert json to yaml so it woul dbe like           error: - email has been taken */ message =
                  JSON.stringify(message);
              }
              setFormErrorMessage(message);
              mergeNewRootState({ formErrorMessage: message });
            }
          }
          setResponseData(body);
          setFormState(res.ok ? "success" : "error");
          if (res.ok) {
            const submitSuccessEvent = new CustomEvent("submit:success", {
              detail: { res, body },
            });
            if (formRef.current) {
              formRef.current.dispatchEvent(submitSuccessEvent);
              if (submitSuccessEvent.defaultPrevented) {
                return;
              }
              /* TODO: option to turn this on/off? */ if (
                props.resetFormOnSubmit !== false
              ) {
                formRef.current.reset();
              }
            }
            /* TODO: client side route event first that can be preventDefaulted */ if (
              props.successUrl
            ) {
              if (formRef.current) {
                const event = new CustomEvent("route", {
                  detail: { url: props.successUrl },
                });
                formRef.current.dispatchEvent(event);
                if (!event.defaultPrevented) {
                  location.href = props.successUrl;
                }
              } else {
                location.href = props.successUrl;
              }
            }
          }
        },
        (err) => {
          const submitErrorEvent = new CustomEvent("submit:error", {
            detail: { error: err },
          });
          if (formRef.current) {
            formRef.current.dispatchEvent(submitErrorEvent);
            if (submitErrorEvent.defaultPrevented) {
              return;
            }
          }
          setResponseData(err);
          setFormState("error");
        }
      );
    }
  }
  return (
    <View
      validate={props.validate}
      ref={formRef}
      action={!props.sendWithJs && props.action}
      method={props.method}
      name={props.name}
      onSubmit={(event) => onSubmit(event)}
      {...{}}
      {...props.attributes}
    >
      {props.builderBlock && props.builderBlock.children ? (
        <>
          {props.builderBlock?.children?.map((block, idx) => (
            <Block
              key={`form-block-${idx}`}
              block={block}
              context={props.builderContext}
              registeredComponents={props.builderComponents}
              linkComponent={props.builderLinkComponent}
            />
          ))}
        </>
      ) : null}
      {submissionState() === "error" ? (
        <Blocks
          path="errorMessage"
          blocks={props.errorMessage!}
          context={props.builderContext}
        />
      ) : null}
      {submissionState() === "sending" ? (
        <Blocks
          path="sendingMessage"
          blocks={props.sendingMessage!}
          context={props.builderContext}
        />
      ) : null}
      {submissionState() === "error" && responseData ? (
        <View style={styles.view1}>
          <BaseText>{JSON.stringify(responseData, null, 2)}</BaseText>
        </View>
      ) : null}
      {submissionState() === "success" ? (
        <Blocks
          path="successMessage"
          blocks={props.successMessage!}
          context={props.builderContext}
        />
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({
  view1: { padding: 10, color: "red", textAlign: "center" },
});
export default FormComponent;