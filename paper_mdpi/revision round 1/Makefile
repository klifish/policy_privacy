TECTONIC ?= tectonic
ROOT := ../..
BUILD_DIR := $(ROOT)/tmp/pdfs/revision-round-1
OUTPUT_DIR := output
SOURCES := reviewer1_response reviewer2_response reviewer3_response

.PHONY: all manuscript letters source reviewer1 reviewer2 reviewer3 clean

# The manuscripts come first: they regenerate locations.tex, whose page and line
# numbers the letters cite.
all: manuscript letters

manuscript:
	./tools/build_manuscripts.sh

letters: reviewer1 reviewer2 reviewer3

# LaTeX source archive for upload; not part of `all`, run it before uploading.
source:
	./tools/package_source.sh

reviewer1: reviewer1_response
reviewer2: reviewer2_response
reviewer3: reviewer3_response

$(SOURCES):
	mkdir -p "$(BUILD_DIR)" "$(OUTPUT_DIR)"
	$(TECTONIC) -X compile "$@.tex" --outdir "$(BUILD_DIR)" --keep-logs
	cp "$(BUILD_DIR)/$@.pdf" "$(OUTPUT_DIR)/$@.pdf"

clean:
	rm -f "$(BUILD_DIR)"/reviewer*_response.*
