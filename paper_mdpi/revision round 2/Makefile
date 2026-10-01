TECTONIC ?= tectonic
ROOT := ../..
BUILD_DIR := $(ROOT)/tmp/pdfs/revision-round-2
OUTPUT_DIR := output
# One entry point per reviewer letter, e.g. reviewer1_response; added once the
# second-round comments are in.
SOURCES :=

.PHONY: all manuscript letters source clean

# The manuscripts come first: they regenerate locations.tex, whose page and line
# numbers the letters cite.
all: manuscript letters

manuscript:
	./tools/build_manuscripts.sh

letters: $(SOURCES)

# LaTeX source archive for upload; not part of `all`, run it before uploading.
source:
	./tools/package_source.sh

$(SOURCES):
	mkdir -p "$(BUILD_DIR)" "$(OUTPUT_DIR)"
	$(TECTONIC) -X compile "$@.tex" --outdir "$(BUILD_DIR)" --keep-logs
	cp "$(BUILD_DIR)/$@.pdf" "$(OUTPUT_DIR)/$@.pdf"

clean:
	rm -f "$(BUILD_DIR)"/reviewer*_response.*
