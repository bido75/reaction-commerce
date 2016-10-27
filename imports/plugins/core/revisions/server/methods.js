import { Products, Media, Revisions, Packages } from "/lib/collections";
import { Meteor } from "meteor/meteor";
import { check, Match } from "meteor/check";

export function updateSettings(settings) {
  check(settings, Object);

  Packages.update({
    name: "reaction-revisions"
  }, {
    $set: {
      settings
    }
  });
}

export function discardDrafts(documentIds) {
  check(documentIds, Match.OneOf(String, Array));

  let documentIdArray;

  if (Array.isArray(documentIds)) {
    documentIdArray = documentIds;
  } else {
    documentIdArray = [documentIds];
  }

  const selector = {
    "workflow.status": {
      $nin: [
        "revision/published"
      ]
    },
    "$or": [
      {
        documentId: {
          $in: documentIdArray
        }
      },
      {
        "documentData.ancestors": {
          $in: documentIdArray
        }
      }
    ]
  };

  const result = Revisions.remove(selector);

  return result > 0;
}

Meteor.methods({
  "revisions/settings/update": updateSettings,
  "revisions/discard": discardDrafts,
  "revisions/publish"(documentIds) {
    check(documentIds, Match.OneOf(String, Array));

    // Also publish variants if they have a draft
    let revisions;

    if (Array.isArray(documentIds)) {
      revisions = Revisions.find({
        "workflow.status": {
          $nin: [
            "revision/published"
          ]
        },
        "$or": [
          {
            documentId: {
              $in: documentIds
            }
          },
          {
            "documentData.ancestors": {
              $in: documentIds
            }
          },
          {
            parentDocument: {
              $in: documentIds
            }
          }
        ]
      }).fetch();
    } else {
      revisions = Revisions.find({
        "workflow.status": {
          $nin: [
            "revision/published"
          ]
        },
        "$or": [
          { documentId: documentIds },
          {
            "documentData.ancestors": {
              $in: [documentIds]
            }
          }
        ]
      }).fetch();
    }

    let updatedDocuments = 0;

    if (revisions) {
      for (const revision of revisions) {
        if (!revision.documentType || revision.documentType === "product") {
          const res = Products.update({
            _id: revision.documentId
          }, {
            $set: revision.documentData
          }, {
            publish: true
          });
          updatedDocuments += res;
        } else if (revision.documentType === "image") {
          const media = Media.findOne(revision.documentId);
          if (media.metadata.workflow === "unpublished") {
            const res = Media.update({
              _id: revision.documentId
            }, {
              $set: {
                "metadata.workflow": "published"
              }
            });
            updatedDocuments += res;
          } else {
            const res = Media.update({
              _id: revision.documentId
            }, {
              $set: {
                "metadata.workflow": "archived"
              }
            });
            updatedDocuments += res;
          }
          // mark revision published whether we are publishing the image or not
          Revisions.update({
            _id: revision._id
          }, {
            $set: {
              "workflow.status": "revision/published"
            }
          });

        }
      }
    }

    if (updatedDocuments > 0) {
      return true;
    }

    return false;
  }
});
