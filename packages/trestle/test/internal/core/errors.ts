/* eslint-disable */
import { assert } from "chai";

import {
  TrestleError, TrestlePluginError
} from "../../../src/internal/core/errors";
import {
  ERROR_RANGES,
  ErrorDescriptor,
  ERRORS
} from "../../../src/internal/core/errors-list";
import { unsafeObjectKeys } from "../../../src/internal/util/unsafe";

const mockErrorDescriptor: ErrorDescriptor = {
  number: 123,
  message: "error message",
  title: "Mock error",
  description: "This is a mock error",
  shouldBeReported: false
};

describe("TrestleError", () => {
  describe("Type guard", () => {
    it("Should return true for TrestleErrors", () => {
      assert.isTrue(
        TrestleError.isTrestleError(new TrestleError(mockErrorDescriptor))
      );
    });

    it("Should return false for everything else", () => {
      assert.isFalse(TrestleError.isTrestleError(new Error()));
      assert.isFalse(
        TrestleError.isTrestleError(new TrestlePluginError("asd", "asd"))
      );
      assert.isFalse(TrestleError.isTrestleError(undefined));
      assert.isFalse(TrestleError.isTrestleError(null));
      assert.isFalse(TrestleError.isTrestleError(123));
      assert.isFalse(TrestleError.isTrestleError("123"));
      assert.isFalse(TrestleError.isTrestleError({ asd: 123 }));
    });
  });

  describe("Without parent error", () => {
    it("should have the right error number", () => {
      const error = new TrestleError(mockErrorDescriptor);
      assert.equal(error.number, mockErrorDescriptor.number);
    });

    it("should format the error code to 4 digits", () => {
      const error = new TrestleError(mockErrorDescriptor);
      assert.equal(error.message.substr(0, 10), "PE123: err");

      assert.equal(
        new TrestleError({
          number: 1,
          message: "",
          title: "Title",
          description: "Description",
          shouldBeReported: false
        }).message.substr(0, 8),
        "PE1: "
      );
    });

    it("should have the right error message", () => {
      const error = new TrestleError(mockErrorDescriptor);
      assert.equal(error.message, `PE123: ${mockErrorDescriptor.message}`);
    });

    it("should format the error message with the template params", () => {
      const error = new TrestleError(
        {
          number: 12,
          message: "%a% %b% %c%",
          title: "Title",
          description: "Description",
          shouldBeReported: false
        },
        { a: "a", b: "b", c: 123 }
      );
      assert.equal(error.message, "PE12: a b 123");
    });

    it("shouldn't have a parent", () => {
      assert.isUndefined(new TrestleError(mockErrorDescriptor).parent);
    });

    it("Should work with instanceof", () => {
      const error = new TrestleError(mockErrorDescriptor);
      assert.instanceOf(error, TrestleError);
    });
  });

  describe("With parent error", () => {
    it("should have the right parent error", () => {
      const parent = new Error();
      const error = new TrestleError(mockErrorDescriptor, {}, parent);
      assert.equal(error.parent, parent);
    });

    it("should format the error message with the template params", () => {
      const error = new TrestleError(
        {
          number: 12,
          message: "%a% %b% %c%",
          title: "Title",
          description: "Description",
          shouldBeReported: false
        },
        { a: "a", b: "b", c: 123 },
        new Error()
      );
      assert.equal(error.message, "PE12: a b 123");
    });

    it("Should work with instanceof", () => {
      const parent = new Error();
      const error = new TrestleError(mockErrorDescriptor, {}, parent);
      assert.instanceOf(error, TrestleError);
    });
  });
});

describe("Error ranges", () => {
  function inRange (n: number, min: number, max: number): boolean {
    return n >= min && n <= max;
  }

  it("Should have max > min", () => {
    for (const errorGroup of unsafeObjectKeys(ERROR_RANGES)) {
      const range = ERROR_RANGES[errorGroup];
      assert.isBelow(range.min, range.max, `Range of ${errorGroup} is invalid`);
    }
  });

  it("Shouldn't overlap ranges", () => {
    for (const errorGroup of unsafeObjectKeys(ERROR_RANGES)) {
      const range = ERROR_RANGES[errorGroup];

      for (const errorGroup2 of unsafeObjectKeys(ERROR_RANGES)) {
        const range2 = ERROR_RANGES[errorGroup2];

        if (errorGroup === errorGroup2) {
          continue;
        }

        assert.isFalse(
          inRange(range2.min, range.min, range.max),
          `Ranges of ${errorGroup} and ${errorGroup2} overlap`
        );

        assert.isFalse(
          inRange(range2.max, range.min, range.max),
          `Ranges of ${errorGroup} and ${errorGroup2} overlap`
        );
      }
    }
  });
});

describe("Error descriptors", () => {
  it("Should have all errors inside their ranges", () => {
    for (const errorGroup of unsafeObjectKeys(ERRORS)) {
      const range = ERROR_RANGES[errorGroup];

      for (const [name, errorDescriptor] of Object.entries<ErrorDescriptor>(
        ERRORS[errorGroup]
      )) {
        assert.isAtLeast(
          errorDescriptor.number,
          range.min,
          `ERRORS.${errorGroup}.${name}'s number is out of range`
        );
        assert.isAtMost(
          errorDescriptor.number,
          range.max - 1,
          `ERRORS.${errorGroup}.${name}'s number is out of range`
        );
      }
    }
  });

  it("Shouldn't repeat error numbers", () => {
    for (const errorGroup of unsafeObjectKeys(ERRORS)) {
      for (const [name, errorDescriptor] of Object.entries<ErrorDescriptor>(
        ERRORS[errorGroup]
      )) {
        for (const [name2, errorDescriptor2] of Object.entries<ErrorDescriptor>(
          ERRORS[errorGroup]
        )) {
          if (name !== name2) {
            assert.notEqual(
              errorDescriptor.number,
              errorDescriptor2.number,
              `ERRORS.${errorGroup}.${name} and ${errorGroup}.${name2} have repeated numbers`
            );
          }
        }
      }
    }
  });
});

describe("TrestlePluginError", () => {
  describe("Type guard", () => {
    it("Should return true for TrestlePluginError", () => {
      assert.isTrue(
        TrestlePluginError.isTrestlePluginError(
          new TrestlePluginError("asd", "asd")
        )
      );
    });

    it("Should return false for everything else", () => {
      assert.isFalse(TrestlePluginError.isTrestlePluginError(new Error()));
      assert.isFalse(
        TrestlePluginError.isTrestlePluginError(
          new TrestleError(ERRORS.GENERAL.NOT_INSIDE_PROJECT)
        )
      );
      assert.isFalse(TrestlePluginError.isTrestlePluginError(undefined));
      assert.isFalse(TrestlePluginError.isTrestlePluginError(null));
      assert.isFalse(TrestlePluginError.isTrestlePluginError(123));
      assert.isFalse(TrestlePluginError.isTrestlePluginError("123"));
      assert.isFalse(TrestlePluginError.isTrestlePluginError({ asd: 123 }));
    });
  });

  describe("constructors", () => {
    describe("automatic plugin name", () => {
      it("Should accept a parent error", () => {
        const message = "m";
        const parent = new Error();

        const error = new TrestlePluginError(message, parent);

        assert.equal(error.message, message);
        assert.equal(error.parent, parent);
      });

      it("Should work without a parent error", () => {
        const message = "m2";

        const error = new TrestlePluginError(message);

        assert.equal(error.message, message);
        assert.isUndefined(error.parent);
      });

      it("Should autodetect the plugin name", () => {
        const message = "m";
        const parent = new Error();

        const error = new TrestlePluginError(message, parent);

        // This is being called from mocha, so that would be used as plugin name
        assert.equal(error.pluginName, "mocha");
      });

      it("Should work with instanceof", () => {
        const message = "m";
        const parent = new Error();

        const error = new TrestlePluginError(message, parent);

        assert.instanceOf(error, TrestlePluginError);
      });
    });

    describe("explicit plugin name", () => {
      it("Should accept a parent error", () => {
        const plugin = "p";
        const message = "m";
        const parent = new Error();

        const error = new TrestlePluginError(plugin, message, parent);

        assert.equal(error.pluginName, plugin);
        assert.equal(error.message, message);
        assert.equal(error.parent, parent);
      });

      it("Should work without a parent error", () => {
        const plugin = "p2";
        const message = "m2";

        const error = new TrestlePluginError(plugin, message);

        assert.equal(error.pluginName, plugin);
        assert.equal(error.message, message);
        assert.isUndefined(error.parent);
      });

      it("Should work with instanceof", () => {
        const plugin = "p";
        const message = "m";
        const parent = new Error();

        const error = new TrestlePluginError(plugin, message, parent);

        assert.instanceOf(error, TrestlePluginError);
      });
    });
  });
});

// describe("applyErrorMessageTemplate", () => {
//  describe("Variable names", () => {
//    it("Should reject invalid variable names", () => {
//      expectTrestleError(
//        () => applyErrorMessageTemplate("", { "1": 1 }),
//        ERRORS.INTERNAL.TEMPLATE_INVALID_VARIABLE_NAME
//      );
//
//      expectTrestleError(
//        () => applyErrorMessageTemplate("", { "asd%": 1 }),
//        ERRORS.INTERNAL.TEMPLATE_INVALID_VARIABLE_NAME
//      );
//
//      expectTrestleError(
//        () => applyErrorMessageTemplate("", { "asd asd": 1 }),
//        ERRORS.INTERNAL.TEMPLATE_INVALID_VARIABLE_NAME
//      );
//    });
//  });
//
//  describe("Values", () => {
//    it("shouldn't contain valid variable tags", () => {
//      expectTrestleError(
//        () => applyErrorMessageTemplate("%asd%", { asd: "%as%" }),
//        ERRORS.INTERNAL.TEMPLATE_VALUE_CONTAINS_VARIABLE_TAG
//      );
//
//      expectTrestleError(
//        () => applyErrorMessageTemplate("%asd%", { asd: "%a123%" }),
//        ERRORS.INTERNAL.TEMPLATE_VALUE_CONTAINS_VARIABLE_TAG
//      );
//
//      expectTrestleError(
//        () =>
//          applyErrorMessageTemplate("%asd%", {
//            asd: { toString: () => "%asd%" },
//          }),
//        ERRORS.INTERNAL.TEMPLATE_VALUE_CONTAINS_VARIABLE_TAG
//      );
//    });
//
//    it("Shouldn't contain the %% tag", () => {
//      expectTrestleError(
//        () => applyErrorMessageTemplate("%asd%", { asd: "%%" }),
//        ERRORS.INTERNAL.TEMPLATE_VALUE_CONTAINS_VARIABLE_TAG
//      );
//    });
//  });
//
//  describe("Replacements", () => {
//    describe("String values", () => {
//      it("Should replace variable tags for the values", () => {
//        assert.equal(
//          applyErrorMessageTemplate("asd %asd% 123 %asd%", { asd: "r" }),
//          "asd r 123 r"
//        );
//
//        assert.equal(
//          applyErrorMessageTemplate("asd%asd% %asd% %fgh% 123", {
//            asd: "r",
//            fgh: "b",
//          }),
//          "asdr r b 123"
//        );
//
//        assert.equal(
//          applyErrorMessageTemplate("asd%asd% %asd% %fgh% 123", {
//            asd: "r",
//            fgh: "",
//          }),
//          "asdr r  123"
//        );
//      });
//    });
//
//    describe("Non-string values", () => {
//      it("Should replace undefined values for undefined", () => {
//        assert.equal(
//          applyErrorMessageTemplate("asd %asd% 123 %asd%", { asd: undefined }),
//          "asd undefined 123 undefined"
//        );
//      });
//
//      it("Should replace null values for null", () => {
//        assert.equal(
//          applyErrorMessageTemplate("asd %asd% 123 %asd%", { asd: null }),
//          "asd null 123 null"
//        );
//      });
//
//      it("Should use their toString methods", () => {
//        const toR = { toString: () => "r" };
//        const toB = { toString: () => "b" };
//        const toEmpty = { toString: () => "" };
//        const toUndefined = { toString: () => undefined };
//
//        assert.equal(
//          applyErrorMessageTemplate("asd %asd% 123 %asd%", { asd: toR }),
//          "asd r 123 r"
//        );
//
//        assert.equal(
//          applyErrorMessageTemplate("asd%asd% %asd% %fgh% 123", {
//            asd: toR,
//            fgh: toB,
//          }),
//          "asdr r b 123"
//        );
//
//        assert.equal(
//          applyErrorMessageTemplate("asd%asd% %asd% %fgh% 123", {
//            asd: toR,
//            fgh: toEmpty,
//          }),
//          "asdr r  123"
//        );
//
//        assert.equal(
//          applyErrorMessageTemplate("asd%asd% %asd% %fgh% 123", {
//            asd: toR,
//            fgh: toUndefined,
//          }),
//          "asdr r undefined 123"
//        );
//      });
//    });
//
//    describe("%% sign", () => {
//      it("Should be replaced with %", () => {
//        assert.equal(applyErrorMessageTemplate("asd%%asd", {}), "asd%asd");
//      });
//        assert.equal(
//          applyErrorMessageTemplate("asd%%asd%% %asd%", { asd: "123" }),
//          "asd%asd% 123"
//        );
//      });
//    });
//
//    describe("Missing variable tag", () => {
//      it("Should fail if a viable tag is missing and its value is not", () => {
//        expectTrestleError(
//          () => applyErrorMessageTemplate("", { asd: "123" }),
//          ERRORS.INTERNAL.TEMPLATE_VARIABLE_TAG_MISSING
//        );
//      });
//    });
//
//    describe("Missing variable", () => {
//      it("Should work, leaving the variable tag", () => {
//        assert.equal(
//          applyErrorMessageTemplate("%asd% %fgh%", { asd: "123" }),
//          "123 %fgh%"
//        );
//      });
//    });
//  });
// });
